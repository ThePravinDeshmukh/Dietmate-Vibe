from models import init_db, DIET_REQUIREMENTS_COLLECTION

# Initial diet requirements
DIET_REQUIREMENTS = [
    {"category": "cereal", "amount": 12.5, "unit": "exchange"},
    {"category": "dried fruit", "amount": 1, "unit": "exchange"},
    {"category": "fresh fruit", "amount": 1, "unit": "exchange"},
    {"category": "legumes", "amount": 3, "unit": "exchange"},
    {"category": "other vegetables", "amount": 3, "unit": "exchange"},
    {"category": "root vegetables", "amount": 2, "unit": "exchange"},
    {"category": "free group", "amount": 3, "unit": "exchange"},
    {"category": "jaggery", "amount": 20, "unit": "grams"},
    {"category": "soy milk", "amount": 120, "unit": "ml"},
    {"category": "sugar", "amount": 10, "unit": "grams"},
    {"category": "oil ghee", "amount": 30, "unit": "grams"},
    {"category": "pa formula", "amount": 32, "unit": "grams"},
    {"category": "cal-c formula", "amount": 24, "unit": "grams"},
    {"category": "isoleucine", "amount": 4, "unit": "grams"},
    {"category": "valine", "amount": 4, "unit": "grams"},
]

def init_requirements():
    """Initialize diet requirements in MongoDB"""
    db = init_db()
    
    try:
        # Clear existing requirements
        db[DIET_REQUIREMENTS_COLLECTION].delete_many({})
        
        # Add new requirements
        db[DIET_REQUIREMENTS_COLLECTION].insert_many(DIET_REQUIREMENTS)
        
        print("Diet requirements initialized successfully!")
    except Exception as e:
        print(f"Error initializing diet requirements: {e}")
        
if __name__ == "__main__":
    init_requirements()