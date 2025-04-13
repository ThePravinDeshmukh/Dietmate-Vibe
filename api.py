from fastapi import FastAPI, HTTPException, Depends
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

@app.post("/entries/")
def add_diet_entry(
    entry: DietEntryCreate,
    db: Session = Depends(get_db)
):
    """Add a new diet entry"""
    db_entry = DietEntry(
        food_item=entry.food_item,
        category=entry.category,
        amount=entry.amount,
        unit=entry.unit,
        notes=entry.notes,
        date=date.today()
    )
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return db_entry

@app.get("/entries/{date_str}")
def get_daily_entries(date_str: str, db: Session = Depends(get_db)):
    """Get all diet entries for a specific date"""
    try:
        query_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        entries = db.query(DietEntry).filter(DietEntry.date == query_date).all()
        return entries
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
    uvicorn.run(app, host="0.0.0.0", port=8000)