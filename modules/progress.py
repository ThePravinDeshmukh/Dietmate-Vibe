from datetime import datetime, time
import pandas as pd
from .config import DAILY_REQUIREMENTS

def calculate_overall_completion(progress_df):
    """Calculate overall diet completion percentage"""
    if progress_df.empty:
        return 0.0
    weighted_completion = (
        (progress_df["percentage"] * progress_df["required"]).sum() / 
        progress_df["required"].sum()
    )
    return min(weighted_completion, 100.0)

def get_time_based_completion_target():
    """Get target completion percentage based on current time"""
    current_time = datetime.now().time()
    
    targets = [
        (time(7, 0), 15),    # Breakfast: 15%
        (time(10, 30), 25),  # Mid-morning: 25%
        (time(13, 0), 50),   # Lunch: 50%
        (time(16, 30), 65),  # Evening snack: 65%
        (time(19, 30), 85),  # Dinner: 85%
        (time(21, 0), 100),  # Before bed: 100%
    ]
    
    current_target = targets[-1][1]
    for target_time, target_pct in targets:
        if current_time < target_time:
            current_target = target_pct
            break
            
    return current_target

def get_smart_suggestions(current_completion, target_completion, progress_df):
    """Get smart suggestions based on current progress and time"""
    current_time = datetime.now().time()
    
    remaining = target_completion - current_completion
    
    attention_needed = []
    for _, row in progress_df.iterrows():
        if row["percentage"] < target_completion:
            attention_needed.append({
                "category": row["category"],
                "current": row["amount"],
                "required": row["required"],
                "remaining": row["required"] - row["amount"]
            })
    
    attention_needed.sort(key=lambda x: x["remaining"], reverse=True)
    suggestions = []
    
    if current_time < time(10, 30):
        suggestions.append("🌅 Good morning! Focus on:")
        categories = ["cereal", "fresh fruit", "milk"]
    elif current_time < time(13, 0):
        suggestions.append("🕙 Mid-morning recommendations:")
        categories = ["dried fruit", "fresh fruit", "legumes"]
    elif current_time < time(16, 30):
        suggestions.append("🌞 Afternoon focus areas:")
        categories = ["legumes", "vegetables", "cereal"]
    elif current_time < time(19, 30):
        suggestions.append("🌆 Evening nutrition goals:")
        categories = ["vegetables", "legumes", "cereal"]
    else:
        suggestions.append("🌙 Complete your daily targets:")
        categories = ["milk", "fruit", "remaining items"]

    for item in attention_needed[:3]:
        suggestions.append(f"• {item['category'].title()}: {item['remaining']:.1f} {row['unit']} remaining")
    
    return suggestions

def sort_categories_by_completion(consumed):
    """Sort categories - incomplete items by name first, completed items at bottom"""
    category_completion = []
    for category, req in DAILY_REQUIREMENTS.items():
        current = consumed.get(category, 0)
        target = req["amount"]
        completion_pct = (current / target * 100) if target > 0 else 100
        category_completion.append({
            'category': category,
            'completion': completion_pct,
            'requirement': req
        })
    
    incomplete = []
    complete = []
    for item in category_completion:
        if item['completion'] < 100:
            incomplete.append(item)
        else:
            complete.append(item)
            
    incomplete.sort(key=lambda x: x['category'])
    complete.sort(key=lambda x: x['category'])
    
    return incomplete + complete

def get_hours_until_midnight():
    """Calculate hours and minutes remaining until midnight"""
    now = datetime.now()
    midnight = (now + pd.Timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    delta = midnight - now
    hours = delta.total_seconds() / 3600
    minutes = (hours % 1) * 60
    return f"{int(hours)}h {int(minutes)}m"