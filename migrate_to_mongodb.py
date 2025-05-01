import sqlite3
import os
from datetime import datetime
import sys
from pymongo import MongoClient
from dotenv import load_dotenv
import certifi

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
MONGODB_DATABASE = os.getenv('MONGODB_DATABASE', 'diet_tracker')

def connect_mongodb():
    """Connect to MongoDB"""
    try:
        client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
        db = client[MONGODB_DATABASE]
        print(f"Connected to MongoDB: {MONGODB_URI}, Database: {MONGODB_DATABASE}")
        return db
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")
        sys.exit(1)

def connect_sqlite(db_path='diet_tracker.db'):
    """Connect to SQLite database"""
    if not os.path.exists(db_path):
        print(f"SQLite database file not found: {db_path}")
        return None
    
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row  # Return rows as dictionaries
        print(f"Connected to SQLite database: {db_path}")
        return conn
    except Exception as e:
        print(f"Error connecting to SQLite: {e}")
        return None

def migrate_requirements(sqlite_conn, mongodb):
    """Migrate diet requirements from SQLite to MongoDB"""
    try:
        cursor = sqlite_conn.cursor()
        cursor.execute("SELECT id, category, amount, unit FROM diet_requirements")
        rows = cursor.fetchall()
        
        if not rows:
            print("No diet requirements found in SQLite database")
            return 0
        
        # Convert rows to list of dictionaries for MongoDB
        requirements_collection = mongodb['diet_requirements']
        requirements_collection.delete_many({})  # Clear existing data
        
        requirements = []
        for row in rows:
            requirement = {
                "category": row["category"],
                "amount": float(row["amount"]),
                "unit": row["unit"]
            }
            requirements.append(requirement)
        
        if requirements:
            result = requirements_collection.insert_many(requirements)
            print(f"Migrated {len(result.inserted_ids)} diet requirements to MongoDB")
            return len(result.inserted_ids)
        return 0
    except Exception as e:
        print(f"Error migrating diet requirements: {e}")
        return 0

def migrate_entries(sqlite_conn, mongodb):
    """Migrate diet entries from SQLite to MongoDB"""
    try:
        cursor = sqlite_conn.cursor()
        cursor.execute("SELECT id, date, category, food_item, amount, unit, timestamp, notes FROM diet_entries")
        rows = cursor.fetchall()
        
        if not rows:
            print("No diet entries found in SQLite database")
            return 0
        
        # Convert rows to list of dictionaries for MongoDB
        entries_collection = mongodb['diet_entries']
        entries_collection.delete_many({})  # Clear existing data
        
        entries = []
        for row in rows:
            # Parse SQLite date string to Python datetime
            date_obj = datetime.strptime(row["date"], "%Y-%m-%d").date() if isinstance(row["date"], str) else row["date"]
            
            # Parse SQLite timestamp string to Python datetime
            if row["timestamp"] and isinstance(row["timestamp"], str):
                timestamp = datetime.strptime(row["timestamp"], "%Y-%m-%d %H:%M:%S.%f")
            else:
                timestamp = datetime.utcnow()
            
            entry = {
                "date": datetime.combine(date_obj, datetime.min.time()),
                "category": row["category"],
                "food_item": row["food_item"],
                "amount": float(row["amount"]),
                "unit": row["unit"],
                "timestamp": timestamp,
                "notes": row["notes"] if row["notes"] else ""
            }
            entries.append(entry)
        
        if entries:
            result = entries_collection.insert_many(entries)
            print(f"Migrated {len(result.inserted_ids)} diet entries to MongoDB")
            return len(result.inserted_ids)
        return 0
    except Exception as e:
        print(f"Error migrating diet entries: {e}")
        return 0

def main():
    """Main migration function"""
    print("Starting migration from SQLite to MongoDB...")
    
    # Connect to databases
    sqlite_conn = connect_sqlite()
    if not sqlite_conn:
        print("Migration aborted: Could not connect to SQLite database")
        return
    
    mongodb = connect_mongodb()
    
    # Perform migrations
    try:
        req_count = migrate_requirements(sqlite_conn, mongodb)
        entries_count = migrate_entries(sqlite_conn, mongodb)
        
        print("\nMigration Summary:")
        print(f"- Diet Requirements: {req_count} records")
        print(f"- Diet Entries: {entries_count} records")
        print("\nMigration completed successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        sqlite_conn.close()

if __name__ == "__main__":
    main()