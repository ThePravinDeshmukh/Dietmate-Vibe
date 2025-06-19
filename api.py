from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, datetime
from typing import List, Dict, Optional
import os
import json
import google.generativeai as genai
from dotenv import load_dotenv
from pydantic import BaseModel
import time
import atexit

from models import init_db, DIET_REQUIREMENTS_COLLECTION, DIET_ENTRIES_COLLECTION
from models import get_diet_entries_by_date, get_diet_requirements
from diet_data_processor import DietDataProcessor

# Load environment variables
load_dotenv()

# Initialize database backup manager
app = FastAPI(title="Diet Tracking API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:8501").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database and processor
db = init_db()
diet_processor = DietDataProcessor()
food_categories = diet_processor.process_all_pdfs()

# Helper dependency to get database
async def get_db():
    """Database dependency"""
    return db

def normalize_category(category: str) -> str:
    """
    Normalize category names to match requirements
    
    Args:
        category: Original category name
        
    Returns:
        Normalized category name
    """
    # Convert to lowercase and remove 'exchange' suffix
    normalized = category.lower().replace(' exchange', '')
    
    # Map specific cases
    mapping = {
        'dried fruits': 'dried fruit',
        'fresh fruits': 'fresh fruit',
        'other vegetable': 'other vegetables',
        'root vegetable': 'root vegetables',
        'leafy vegetable': 'other vegetables',  # Consider leafy as part of other vegetables
        'misc free group': 'free group',
        'juices': 'free group'  # Map juices to free group
    }
    return mapping.get(normalized, normalized)

# Pydantic models
class DietEntryCreate(BaseModel):
    """Schema for creating a diet entry"""
    food_item: str
    category: str
    amount: float
    unit: str
    notes: Optional[str] = None

class BatchDietEntries(BaseModel):
    """Schema for creating multiple diet entries"""
    entries: List[DietEntryCreate]
    date: Optional[str] = None

# Test endpoints
@app.get("/test/health")
def health_check():
    """Test endpoint to check if the API is running"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/test/version")
def version_check():
    """Test endpoint to get API version information"""
    return {
        "version": "1.0.0",
        "python_version": os.sys.version,
        "fastapi_running": True
    }

@app.get("/test/database")
async def database_check(db = Depends(get_db)):
    """Test endpoint to verify database connectivity"""
    try:
        # Try to make a simple query
        requirements = list(db[DIET_REQUIREMENTS_COLLECTION].find().limit(1))
        return {
            "status": "connected",
            "database_url": os.getenv('MONGODB_URI', 'mongodb://localhost:27017'),
            "database": os.getenv('MONGODB_DATABASE', 'diet_tracker'),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

# Food category endpoints
@app.get("/categories")
def get_categories():
    """Get all available food categories"""
    return list(food_categories.keys())

@app.get("/foods/{category}")
def get_foods_in_category(category: str):
    """Get all food items in a category"""
    df = diet_processor.get_food_choices(category)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"Category {category} not found")
    return df.to_dict(orient='records')

# Diet entry endpoints
@app.post("/entries/")
async def add_diet_entry(
    entry: DietEntryCreate,
    db = Depends(get_db)
):
    """Add a new diet entry"""
    try:
        # Normalize the category
        normalized_category = normalize_category(entry.category)
        
        # Check if entry already exists for this category today
        today = date.today()
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        
        existing_entry = db[DIET_ENTRIES_COLLECTION].find_one({
            "date": {"$gte": today_start, "$lte": today_end},
            "category": normalized_category
        })
        
        if existing_entry:
            # Update existing entry
            db[DIET_ENTRIES_COLLECTION].update_one(
                {"_id": existing_entry["_id"]},
                {
                    "$set": {
                        "amount": entry.amount,
                        "notes": entry.notes,
                        "timestamp": datetime.utcnow()
                    }
                }
            )
        else:
            # Create new entry
            db[DIET_ENTRIES_COLLECTION].insert_one({
                "food_item": entry.food_item,
                "category": normalized_category,
                "amount": entry.amount,
                "unit": entry.unit,
                "notes": entry.notes,
                "date": datetime.combine(today, datetime.min.time()),
                "timestamp": datetime.utcnow()
            })
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/entries/batch")
async def add_diet_entries_batch(
    batch: BatchDietEntries,
    db = Depends(get_db)
):
    """Add multiple diet entries in a single transaction"""
    try:
        # Parse provided date or default to today
        entry_date = date.today()
        if batch.date:
            try:
                entry_date = datetime.strptime(batch.date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        entry_datetime = datetime.combine(entry_date, datetime.min.time())
        
        # Get all existing entries for the selected date
        start_of_day = datetime.combine(entry_date, datetime.min.time())
        end_of_day = datetime.combine(entry_date, datetime.max.time())
        
        existing_entries = {
            entry["category"]: entry 
            for entry in db[DIET_ENTRIES_COLLECTION].find({
                "date": {"$gte": start_of_day, "$lte": end_of_day}
            })
        }
        
        # Update or create entries
        for entry in batch.entries:
            # Normalize the category
            normalized_category = normalize_category(entry.category)
            
            if normalized_category in existing_entries:
                # Update existing entry
                db[DIET_ENTRIES_COLLECTION].update_one(
                    {"_id": existing_entries[normalized_category]["_id"]},
                    {
                        "$set": {
                            "amount": entry.amount,
                            "notes": entry.notes,
                            "timestamp": datetime.utcnow()
                        }
                    }
                )
            else:
                # Create new entry
                db[DIET_ENTRIES_COLLECTION].insert_one({
                    "food_item": entry.food_item,
                    "category": normalized_category,
                    "amount": entry.amount,
                    "unit": entry.unit,
                    "notes": entry.notes,
                    "date": entry_datetime,
                    "timestamp": datetime.utcnow()
                })
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/entries/reset")
async def reset_entries(
    data: dict = None, 
    db = Depends(get_db)
):
    """Reset all entries for a specific date to 0"""
    try:
        # Parse provided date or default to today
        entry_date = date.today()
        if data and "date" in data:
            try:
                entry_date = datetime.strptime(data["date"], "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        # Delete all entries for the selected date
        start_of_day = datetime.combine(entry_date, datetime.min.time())
        end_of_day = datetime.combine(entry_date, datetime.max.time())
        
        db[DIET_ENTRIES_COLLECTION].delete_many({
            "date": {"$gte": start_of_day, "$lte": end_of_day}
        })
        
        # Define default units for categories
        default_units = {cat: "exchange" if cat in ["cereal", "dried fruit", "fresh fruit", "legumes", 
                        "other vegetables", "root vegetables", "free group"] else "grams" 
                        for cat in food_categories}
        
        # Create new entries with 0 values for all categories
        entry_datetime = datetime.combine(entry_date, datetime.min.time())
        entries_to_insert = []
        
        for category in food_categories:
            entries_to_insert.append({
                "food_item": category,
                "category": category,
                "amount": 0,
                "unit": default_units.get(category, "exchange"),
                "notes": "Reset to 0",
                "date": entry_datetime,
                "timestamp": datetime.utcnow()
            })
        
        # Insert all at once for better performance
        if entries_to_insert:
            db[DIET_ENTRIES_COLLECTION].insert_many(entries_to_insert)
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/entries/{date_str}")
async def get_daily_entries(date_str: str):
    """Get all diet entries for a specific date"""
    try:
        entries = get_diet_entries_by_date(date_str)
        
        return [
            {
                "category": entry.get("category", ""),
                "food_item": entry.get("food_item", ""),
                "amount": float(entry.get("amount", 0)),
                "unit": entry.get("unit", ""),
                "notes": entry.get("notes", ""),
                "date": entry.get("date").date().isoformat()
            }
            for entry in entries
        ]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

@app.get("/entries/batch/{start_date}/{end_date}")
async def get_batch_entries(start_date: str, end_date: str, db = Depends(get_db)):
    """Get all diet entries for a date range (inclusive)"""
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
        
        # Ensure start date is before end date
        if start > end:
            raise HTTPException(status_code=400, detail="Start date must be before or equal to end date")
            
        # Query all entries within the date range
        start_datetime = datetime.combine(start, datetime.min.time())
        end_datetime = datetime.combine(end, datetime.max.time())
        
        entries = list(db[DIET_ENTRIES_COLLECTION].find({
            "date": {"$gte": start_datetime, "$lte": end_datetime}
        }))
        
        # Group entries by date
        result = {}
        for entry in entries:
            date_str = entry.get("date").date().isoformat()
            if date_str not in result:
                result[date_str] = []
                
            # Convert ObjectId to string for serialization
            entry_dict = {
                "category": entry.get("category", ""),
                "food_item": entry.get("food_item", ""),
                "amount": float(entry.get("amount", 0)),
                "unit": entry.get("unit", ""),
                "notes": entry.get("notes", ""),
                "date": date_str
            }
            result[date_str].append(entry_dict)
            
        return result
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

# AI recommendations endpoint
async def get_ai_recommendation(food_history: List[Dict], requirements: List[Dict]) -> str:
    """
    Get AI-powered diet recommendations using Google's Gemini API
    
    Args:
        food_history: List of recent food entries
        requirements: List of dietary requirements
        
    Returns:
        String containing AI-generated recommendations
    """
    try:
        # Configure the Gemini API
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            return "Error: Gemini API key not found in environment variables"
        
        genai.configure(api_key=api_key)
        
        # Initialize the model
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Calculate remaining exchanges
        consumed = {entry["category"]: entry["amount"] for entry in food_history}
        remaining = {}
        for req in requirements:
            category = req["category"]
            required = req["amount"]
            consumed_amount = consumed.get(category, 0)
            if consumed_amount < required:
                remaining[category] = {
                    "amount": required - consumed_amount,
                    "unit": req["unit"]
                }
        
        # Get available food items from PDFs for remaining categories
        available_foods = {}
        for category in remaining.keys():
            foods = diet_processor.get_food_choices(category)
            if not foods.empty:
                available_foods[category] = foods.to_dict(orient='records')
          # Get current time for context
        current_hour = datetime.now().hour
        meal_time = "breakfast" if current_hour < 11 else "lunch" if current_hour < 16 else "dinner" if current_hour < 22 else "snack"
        
        # Format remaining items more clearly
        remaining_details = "\n".join([
            f"- {category}: {details['amount']} {details['unit']} remaining"
            for category, details in remaining.items()
        ])
        
        # Format available foods more clearly
        available_combinations = {}
        for category, foods in available_foods.items():
            if foods:
                available_combinations[category] = [
                    f"{food.get('food_item', 'Unknown')} ({food.get('portion_size', 'portion size not specified')})"
                    for food in foods[:5]  # Limit to 5 examples per category
                ]
        
        # Construct the prompt with more specific guidance
        prompt = f"""As a specialized pediatric nutritionist, provide detailed recommendations for {meal_time} based on:

CURRENT SITUATION:
- Meal time: {meal_time}
- Remaining daily requirements:
{remaining_details}

AVAILABLE FOOD OPTIONS PER CATEGORY:
{json.dumps(available_combinations, indent=2)}

Please provide a structured response with:

1. IMMEDIATE RECOMMENDATIONS:
   - Suggest specific food combinations from the available options that work well for {meal_time}
   - Show exact exchange values and portion sizes
   - Focus on meeting the categories with highest remaining requirements first

2. RECIPE IDEAS (2-3 kid-friendly combinations):
   - Use only the available ingredients listed above
   - Combine items from different food categories when possible
   - Specify exact portions and exchange values
   - Include simple preparation instructions

3. PLANNING FOR REMAINING DAY:
   - Suggest how to distribute the remaining exchanges across future meals
   - Highlight any nutritional gaps that need attention

Requirements:
- Be very specific with food items, using only those listed
- Include exact exchange values for each suggestion
- Keep portions child-appropriate
- Make combinations appealing and practical for children
- Consider the time of day ({meal_time}) when making suggestions

Remember this is for a child with special dietary needs and suggestions should be practical to prepare."""        # Generate response
        response = model.generate_content(prompt)
        if not response:
            return "Error: No response received from Gemini API"
        
        # Return both prompt and response
        full_response = f"""
=== PROMPT SENT TO AI ===
{prompt}

=== AI RESPONSE ===
{response.text}
"""
        return full_response
    except Exception as e:
        return f"Error getting AI recommendation: {str(e)}"

@app.get("/recommendations")
async def get_recommendations(db = Depends(get_db)):
    """Get AI-powered recommendations based on recent diet history"""
    try:
        # Get today's entries
        today = date.today()
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        
        entries = list(db[DIET_ENTRIES_COLLECTION].find({
            "date": {"$gte": today_start, "$lte": today_end}
        }))
        
        # Get requirements
        requirements = list(db[DIET_REQUIREMENTS_COLLECTION].find())
        
        # Get AI recommendations
        recommendations = await get_ai_recommendation(entries, requirements)
        return {"recommendations": recommendations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)