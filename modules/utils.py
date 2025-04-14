from datetime import datetime, date, time
import pandas as pd

# Define daily requirements
DAILY_REQUIREMENTS = {
    "cereal": {"amount": 12.5, "unit": "exchange"},
    "dried fruit": {"amount": 1, "unit": "exchange"},
    "fresh fruit": {"amount": 1, "unit": "exchange"},
    "legumes": {"amount": 3, "unit": "exchange"},
    "other vegetables": {"amount": 3, "unit": "exchange"},
    "root vegetables": {"amount": 2, "unit": "exchange"},
    "free group": {"amount": 3, "unit": "exchange"},
    "jaggery": {"amount": 20, "unit": "grams"},
    "soy milk": {"amount": 120, "unit": "ml"},
    "sugar": {"amount": 10, "unit": "grams"},
    "oil ghee": {"amount": 30, "unit": "grams"},
    "pa formula": {"amount": 32, "unit": "grams"},
    "cal-c formula": {"amount": 24, "unit": "grams"},
    "isoleucine": {"amount": 4, "unit": "grams"},
    "valine": {"amount": 4, "unit": "grams"},
}

# Cache settings
CACHE_TTL = 300  # 5 minutes

def normalize_category(category):
    """Normalize category names for consistent comparison"""
    return category.lower().strip()

def get_daily_requirements():
    """Get daily requirements dictionary"""
    return DAILY_REQUIREMENTS

def calculate_overall_completion(progress_df):
    """Calculate overall completion percentage"""
    if progress_df.empty:
        return 0.0
    return progress_df["percentage"].mean()

def get_time_based_completion_target():
    """Calculate target completion based on current time"""
    now = datetime.now().time()
    if now < time(9, 0):  # Before 9 AM
        return 20
    elif now < time(12, 0):  # Before noon
        return 40
    elif now < time(15, 0):  # Before 3 PM
        return 60
    elif now < time(18, 0):  # Before 6 PM
        return 80
    else:
        return 100

def get_hours_until_midnight():
    """Calculate time remaining until next day"""
    now = datetime.now()
    tomorrow = datetime.combine(date.today() + pd.Timedelta(days=1), time.min)
    remaining = tomorrow - now
    hours = remaining.total_seconds() / 3600
    return f"{int(hours)}h {int((hours % 1) * 60)}m"

def get_smart_suggestions(overall_completion, target_completion, progress_df):
    """Generate smart suggestions based on current progress"""
    suggestions = []
    
    # Check overall progress
    if overall_completion < target_completion:
        suggestions.append(f"⚠️ Overall progress ({overall_completion:.1f}%) is below target ({target_completion}%)")
    
    # Find categories that need attention
    needs_attention = progress_df[progress_df["percentage"] < 50].sort_values("percentage")
    if not needs_attention.empty:
        suggestions.append("🎯 Focus on these categories:")
        for _, row in needs_attention.iterrows():
            suggestions.append(f"- {row['category'].title()}: {row['percentage']:.1f}% complete")
    
    return suggestions

def sort_categories_by_completion(consumed):
    """Sort categories by completion percentage, incomplete first"""
    categories = []
    for category, req in DAILY_REQUIREMENTS.items():
        current = consumed.get(category, 0)
        completion = (current / req["amount"]) * 100
        categories.append({
            "category": category,
            "completion": completion
        })
    return sorted(categories, key=lambda x: x["completion"])