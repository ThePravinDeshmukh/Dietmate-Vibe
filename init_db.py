from sqlalchemy.orm import sessionmaker
from models import DietRequirement, init_db

# Initial diet requirements
DIET_REQUIREMENTS = [
    ("cereal", 12.5, "exchange"),
    ("dried fruit", 1, "exchange"),
    ("fresh fruit", 1, "exchange"),
    ("legumes", 3, "exchange"),
    ("other vegetables", 3, "exchange"),
    ("root vegetables", 2, "exchange"),
    ("free group", 3, "exchange"),
    ("jaggery", 20, "grams"),
    ("soy milk", 120, "ml"),
    ("sugar", 10, "grams"),
    ("oil ghee", 30, "grams"),
    ("pa formula", 32, "grams"),
    ("cal-c formula", 24, "grams"),
    ("isoleucine", 4, "grams"),
    ("valine", 4, "grams"),
]

def init_requirements():
    engine = init_db()
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Clear existing requirements
        session.query(DietRequirement).delete()
        
        # Add new requirements
        for category, amount, unit in DIET_REQUIREMENTS:
            requirement = DietRequirement(
                category=category,
                amount=amount,
                unit=unit
            )
            session.add(requirement)
        
        session.commit()
        print("Diet requirements initialized successfully!")
    except Exception as e:
        print(f"Error initializing diet requirements: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    init_requirements()