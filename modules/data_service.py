import sqlite3
from datetime import datetime
from .config import DAILY_REQUIREMENTS

def get_db_connection():
    """Get a connection to the SQLite database"""
    conn = sqlite3.connect('diet_tracker.db')
    conn.row_factory = sqlite3.Row
    return conn

def load_daily_entries(date=None):
    """Load entries for a specific date or today"""
    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # First, ensure we have entries for all categories
    for category in DAILY_REQUIREMENTS.keys():
        cursor.execute("""
            INSERT OR IGNORE INTO daily_tracking (date, category, amount)
            VALUES (?, ?, 0.0)
        """, (date, category))
    
    cursor.execute("""
        SELECT category, amount 
        FROM daily_tracking 
        WHERE date = ?
    """, (date,))
    
    entries = [dict(row) for row in cursor.fetchall()]
    
    conn.commit()
    conn.close()
    
    return entries

def save_entries(changes, date=None):
    """Save updated entries to the database"""
    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        for category, amount in changes.items():
            cursor.execute("""
                UPDATE daily_tracking 
                SET amount = ? 
                WHERE date = ? AND category = ?
            """, (amount, date, category))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error saving entries: {e}")
        return False

def reset_all_values(date=None):
    """Reset all values for a specific date to zero"""
    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE daily_tracking 
            SET amount = 0.0 
            WHERE date = ?
        """, (date,))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error resetting values: {e}")
        return False

def get_history(days=7):
    """Get historical data for the specified number of days"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT date, category, amount 
        FROM daily_tracking 
        WHERE date >= date('now', ?) 
        ORDER BY date DESC
    """, (f'-{days} days',))
    
    history = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return history