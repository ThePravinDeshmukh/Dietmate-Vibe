from sqlalchemy import create_engine, Column, Integer, Float, String, Date, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import os

Base = declarative_base()

class DietRequirement(Base):
    __tablename__ = "diet_requirements"
    
    id = Column(Integer, primary_key=True)
    category = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    unit = Column(String, nullable=False)  # 'exchange' or 'grams' or 'ml'
    
    def __repr__(self):
        return f"{self.category}: {self.amount} {self.unit}"

class DietEntry(Base):
    __tablename__ = "diet_entries"
    
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, default=datetime.utcnow().date)
    category = Column(String, nullable=False)
    food_item = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    notes = Column(String, nullable=True)

    def __repr__(self):
        return f"{self.date}: {self.food_item} - {self.amount} {self.unit}"

# Create database and tables
def init_db(db_url=None):
    """Initialize database with support for both SQLite and PostgreSQL"""
    if db_url is None:
        db_url = os.getenv('DATABASE_URL', 'sqlite:///diet_tracker.db')
        
        # Handle Heroku-style PostgreSQL URLs
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)
    
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    return engine

if __name__ == "__main__":
    # Initialize database
    init_db()