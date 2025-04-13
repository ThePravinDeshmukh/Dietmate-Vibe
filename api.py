from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, sessionmaker
from datetime import date, datetime
import openai
from typing import List, Dict
import os
from dotenv import load_dotenv
from pydantic import BaseModel

from models import DietRequirement, DietEntry, init_db
from diet_data_processor import DietDataProcessor

# Load environment variables
load_dotenv()

app = FastAPI(title="Diet Tracking API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:8501").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

diet_processor = DietDataProcessor()
food_categories = diet_processor.process_all_pdfs()

# Initialize database
engine = init_db()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
def database_check(db: Session = Depends(get_db)):
    """Test endpoint to verify database connectivity"""
    try:
        # Try to make a simple query
        db.query(DietRequirement).first()
        return {
            "status": "connected",
            "database_url": os.getenv('DATABASE_URL', 'sqlite:///diet_tracker.db'),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

def get_ai_recommendation(food_history: List[Dict], requirements: List[Dict]) -> str:
    """Get AI-powered diet recommendations"""
    try:
        client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        
        # Construct the prompt
        prompt = f"""
        Based on the following daily diet requirements:
        {requirements}
        
        And recent food consumption:
        {food_history}
        
        Please provide personalized recommendations for:
        1. What food items to consume next
        2. Any nutritional gaps to address
        3. Suggestions for balanced meal planning
        
        Keep in mind this is for a child with special dietary needs.
        """
        
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a specialized pediatric nutritionist."},
                {"role": "user", "content": prompt}
            ]
        )
        
        return response.choices[0].message.content
    except Exception as e:
        return f"Error getting AI recommendation: {str(e)}"

def normalize_category(category):
    """Normalize category names to match requirements"""
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

# Add Pydantic model for entry
class DietEntryCreate(BaseModel):
    food_item: str
    category: str
    amount: float
    unit: str
    notes: str | None = None

# Add new Pydantic model for batch entries
class BatchDietEntries(BaseModel):
    entries: List[DietEntryCreate]

@app.post("/entries/")
def add_diet_entry(
    entry: DietEntryCreate,
    db: Session = Depends(get_db)
):
    """Add a new diet entry"""
    # Normalize the category
    normalized_category = normalize_category(entry.category)
    
    # Check if entry already exists for this category today
    today = date.today()
    existing_entry = db.query(DietEntry).filter(
        DietEntry.date == today,
        DietEntry.category == normalized_category
    ).first()
    
    if existing_entry:
        # Update existing entry
        existing_entry.amount = entry.amount  # Replace instead of add
        existing_entry.notes = entry.notes
    else:
        # Create new entry
        db_entry = DietEntry(
            food_item=entry.food_item,
            category=normalized_category,
            amount=entry.amount,
            unit=entry.unit,
            notes=entry.notes,
            date=today
        )
        db.add(db_entry)
    
    db.commit()
    return {"status": "success"}

@app.post("/entries/batch")
def add_diet_entries_batch(
    batch: BatchDietEntries,
    db: Session = Depends(get_db)
):
    """Add multiple diet entries in a single transaction"""
    today = date.today()
    try:
        # Get all existing entries for today
        existing_entries = {
            entry.category: entry 
            for entry in db.query(DietEntry).filter(DietEntry.date == today).all()
        }
        
        # Update or create entries in a single transaction
        for entry in batch.entries:
            # Normalize the category
            normalized_category = normalize_category(entry.category)
            
            if normalized_category in existing_entries:
                # Update existing entry
                existing = existing_entries[normalized_category]
                existing.amount = entry.amount
                existing.notes = entry.notes
            else:
                # Create new entry
                db_entry = DietEntry(
                    food_item=entry.food_item,
                    category=normalized_category,
                    amount=entry.amount,
                    unit=entry.unit,
                    notes=entry.notes,
                    date=today
                )
                db.add(db_entry)
        
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/entries/reset")
def reset_entries(db: Session = Depends(get_db)):
    """Reset all entries for today to 0"""
    today = date.today()
    try:
        # Delete all entries for today
        db.query(DietEntry).filter(DietEntry.date == today).delete()
        
        # Create new entries with 0 values for all categories
        for category in food_categories:
            db_entry = DietEntry(
                food_item=category,
                category=category,
                amount=0,
                unit="exchange" if category in ["cereal", "dried fruit", "fresh fruit", "legumes", "other vegetables", "root vegetables", "free group"] else "grams",
                notes="Reset to 0",
                date=today
            )
            db.add(db_entry)
        
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/entries/{date_str}")
def get_daily_entries(date_str: str, db: Session = Depends(get_db)):
    """Get all diet entries for a specific date"""
    try:
        query_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        entries = db.query(DietEntry).filter(DietEntry.date == query_date).all()
        
        # Properly serialize the model objects
        return [
            {
                "category": entry.category,
                "food_item": entry.food_item,
                "amount": float(entry.amount),  # Ensure amount is float
                "unit": entry.unit,
                "notes": entry.notes,
                "date": entry.date.isoformat()
            }
            for entry in entries
        ]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

@app.get("/recommendations")
def get_recommendations(db: Session = Depends(get_db)):
    """Get AI-powered recommendations based on recent diet history"""
    # Get today's entries
    today = date.today()
    entries = db.query(DietEntry).filter(DietEntry.date == today).all()
    
    # Get requirements
    requirements = db.query(DietRequirement).all()
    
    # Get AI recommendations
    recommendations = get_ai_recommendation(entries, requirements)
    return {"recommendations": recommendations}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)