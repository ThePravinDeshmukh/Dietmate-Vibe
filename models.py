from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
import certifi

# MongoDB connection settings
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
DATABASE_NAME = os.getenv('MONGODB_DATABASE', 'diet_tracker')

# MongoDB collections (equivalent to SQL tables)
DIET_REQUIREMENTS_COLLECTION = 'diet_requirements'
DIET_ENTRIES_COLLECTION = 'diet_entries'

# Synchronous client for direct usage
client = None
db = None

# Asynchronous client for FastAPI
async_client = None
async_db = None

def init_db(mongo_uri=None):
    """Initialize MongoDB connection"""
    global client, db, async_client, async_db
    
    if mongo_uri is None:
        mongo_uri = MONGODB_URI
    
    # Initialize synchronous client
    client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
    db = client[DATABASE_NAME]
    
    # Initialize asynchronous client
    async_client = AsyncIOMotorClient(mongo_uri, tlsCAFile=certifi.where())
    async_db = async_client[DATABASE_NAME]
    
    # Create indexes if needed
    db.diet_entries.create_index([("date", 1)])
    db.diet_entries.create_index([("category", 1)])
    
    return db

# Schema validation for MongoDB (optional but recommended)
diet_requirement_schema = {
    "bsonType": "object",
    "required": ["category", "amount", "unit"],
    "properties": {
        "category": {
            "bsonType": "string",
            "description": "Category of diet requirement"
        },
        "amount": {
            "bsonType": "double",
            "description": "Required amount"
        },
        "unit": {
            "bsonType": "string",
            "description": "Unit of measurement"
        }
    }
}

diet_entry_schema = {
    "bsonType": "object",
    "required": ["date", "category", "food_item", "amount", "unit", "timestamp"],
    "properties": {
        "date": {
            "bsonType": "date",
            "description": "Date of entry"
        },
        "category": {
            "bsonType": "string",
            "description": "Food category"
        },
        "food_item": {
            "bsonType": "string",
            "description": "Food item name"
        },
        "amount": {
            "bsonType": "double",
            "description": "Amount consumed"
        },
        "unit": {
            "bsonType": "string",
            "description": "Unit of measurement"
        },
        "timestamp": {
            "bsonType": "date",
            "description": "Time when entry was created"
        },
        "notes": {
            "bsonType": "string",
            "description": "Additional notes"
        }
    }
}

# Helper functions for common MongoDB operations
def get_diet_requirements() -> List[Dict[str, Any]]:
    """Get all diet requirements"""
    if db is None:
        init_db()
    return list(db[DIET_REQUIREMENTS_COLLECTION].find({}, {'_id': 0}))

def get_diet_entries_by_date(date_str: str) -> List[Dict[str, Any]]:
    """Get diet entries for a specific date"""
    if db is None:
        init_db()
    
    try:
        # Convert string date to datetime object for MongoDB query
        query_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        start_of_day = datetime.combine(query_date, datetime.min.time())
        end_of_day = datetime.combine(query_date, datetime.max.time())
        
        # Query MongoDB
        entries = list(db[DIET_ENTRIES_COLLECTION].find({
            "date": {"$gte": start_of_day, "$lte": end_of_day}
        }))
        
        # Convert MongoDB ObjectID to string for JSON serialization
        for entry in entries:
            if '_id' in entry:
                entry['_id'] = str(entry['_id'])
                
        return entries
    except Exception as e:
        print(f"Error retrieving diet entries: {e}")
        return []

async def get_diet_entries_async(date_str: str) -> List[Dict[str, Any]]:
    """Async version of getting diet entries for a specific date"""
    if async_db is None:
        init_db()
    
    try:
        query_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        start_of_day = datetime.combine(query_date, datetime.min.time())
        end_of_day = datetime.combine(query_date, datetime.max.time())
        
        cursor = async_db[DIET_ENTRIES_COLLECTION].find({
            "date": {"$gte": start_of_day, "$lte": end_of_day}
        })
        
        entries = await cursor.to_list(length=100)
        
        # Convert MongoDB ObjectID to string
        for entry in entries:
            if '_id' in entry:
                entry['_id'] = str(entry['_id'])
                
        return entries
    except Exception as e:
        print(f"Error retrieving diet entries asynchronously: {e}")
        return []

if __name__ == "__main__":
    # Initialize database connection when module is run directly
    init_db()
    print(f"MongoDB connection established to {MONGODB_URI}")