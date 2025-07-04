import os
import streamlit as st
import pandas as pd
import requests
from datetime import datetime, date, time
import plotly.express as px
from modules import history  # Import the history module
import json
import time as timelib

# API endpoint - use environment variable with fallback
API_URL = os.getenv('API_URL', 'http://localhost:8000')

st.set_page_config(page_title="Diet Tracker", layout="wide")

# Initialize session state for caching
if 'daily_entries' not in st.session_state:
    st.session_state.daily_entries = None
if 'last_update' not in st.session_state:
    st.session_state.last_update = None
if 'pending_changes' not in st.session_state:
    st.session_state.pending_changes = 0  # Track number of slider changes
if 'change_threshold' not in st.session_state:
    st.session_state.change_threshold = 3  # Auto-save after this many changes
if 'reset_sliders' not in st.session_state:
    st.session_state.reset_sliders = False

# Daily requirements (max values for sliders)
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
    "valine": {"amount": 4, "unit": "grams"}
}

# Add CSS for slider colors
SLIDER_STYLES = """
<style>
    /* Green color for completed sliders */
    div[data-testid="stSlider"][aria-valuenow="100"] .stSlider > div > div > div {
        background-color: #28a745 !important;
    }
    div[data-testid="stSlider"][aria-valuenow="100"] .stSlider > div > div > div > div {
        background-color: #1e7e34 !important;
    }
</style>
"""

@st.cache_data(ttl=300)  # Cache for 5 minutes
def load_daily_entries(date_str):
    print(f"Loading entries for {date_str}")  # Debug logging
    response = requests.get(f"{API_URL}/entries/{date_str}")
    if response.status_code == 200:
        data = response.json()
        # Initialize all categories with 0 if they don't exist
        all_entries = {category: 0.0 for category in DAILY_REQUIREMENTS.keys()}
        # Update with actual values from database
        for entry in data:
            category = normalize_category(entry['category'])
            all_entries[category] = float(entry['amount'])
        
        # Safe dictionary access with default values
        return [
            {
                "category": cat,
                "amount": amt,
                "unit": DAILY_REQUIREMENTS.get(cat, {"unit": "exchange"})["unit"]
            }
            for cat, amt in all_entries.items()
        ]
    return []

def save_entries(entries, date_str=None):
    """Save multiple entries in a single request"""
    entries_list = []
    
    for category, amount in entries.items():
        # Handle categories not in DAILY_REQUIREMENTS
        if category not in DAILY_REQUIREMENTS:
            print(f"Warning: Unknown category '{category}' - using default unit 'exchange'")
            unit = "exchange"
        else:
            unit = DAILY_REQUIREMENTS[category]["unit"]
            
        entries_list.append({
            "food_item": category,
            "category": category,
            "amount": float(amount),
            "unit": unit,
            "notes": "Updated via slider"
        })
    
    # Include the date in the request if provided
    request_data = {"entries": entries_list}
    if date_str:
        request_data["date"] = date_str
    
    response = requests.post(
        f"{API_URL}/entries/batch",
        json=request_data
    )
    return response.status_code == 200

def update_progress_data(selected_date_str):
    """Update cached daily entries"""
    # Clear the cache before updating
    load_daily_entries.clear()
    st.session_state.daily_entries = load_daily_entries(selected_date_str)
    st.session_state.last_update = datetime.now()

def get_consumed_amounts():
    """Get current consumed amounts from cached data"""
    consumed = {category: 0.0 for category in DAILY_REQUIREMENTS.keys()}
    if st.session_state.daily_entries:
        for entry in st.session_state.daily_entries:
            category = entry['category']
            consumed[category] = float(entry['amount'])
    return consumed

def reset_all_values(selected_date_str=None):
    """Reset all values to 0 in the database and clear session state"""
    # Call the reset endpoint
    response = requests.post(f"{API_URL}/entries/reset", json={"date": selected_date_str})
    success = response.status_code == 200
    
    if success:
        # Clear session state
        st.session_state.daily_entries = None
        st.session_state.last_update = None
        # Clear all slider values in session state
        for category in DAILY_REQUIREMENTS.keys():
            if f"slider_{category}" in st.session_state:
                st.session_state[f"slider_{category}"] = 0.0
    return success

def reset_sliders_locally():
    """Reset all slider values to 0 locally without making API calls"""
    # Instead of directly setting slider values, we'll set a flag
    # that will be used to reset sliders on the next rerun
    st.session_state.reset_sliders = True
    return True

def normalize_category(category):
    """Normalize category names to match DAILY_REQUIREMENTS keys"""
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

def calculate_overall_completion(progress_df):
    """Calculate overall diet completion percentage"""
    if progress_df.empty:
        return 0.0
    # Weight the completion by the importance/amount of each item
    weighted_completion = (
        (progress_df["percentage"] * progress_df["required"]).sum() / 
        progress_df["required"].sum()
    )
    return min(weighted_completion, 100.0)

def get_time_based_completion_target():
    """Get target completion percentage based on current time"""
    current_time = datetime.now().time()
    
    # Define meal times and expected completion percentages
    targets = [
        (time(7, 0), 15),    # Breakfast: 15%
        (time(10, 30), 25),  # Mid-morning: 25%
        (time(13, 0), 50),   # Lunch: 50%
        (time(16, 30), 65),  # Evening snack: 65%
        (time(19, 30), 85),  # Dinner: 85%
        (time(21, 0), 100),  # Before bed: 100%
    ]
    
    # Find the current target
    current_target = targets[-1][1]  # Default to 100%
    for target_time, target_pct in targets:
        if current_time < target_time:
            current_target = target_pct
            break
            
    return current_target

def get_smart_suggestions(current_completion, target_completion, progress_df):
    """Get smart suggestions based on current progress and time"""
    current_time = datetime.now().time()
    
    # Calculate remaining percentage needed
    remaining = target_completion - current_completion
    
    # Find categories that need attention
    attention_needed = []
    for _, row in progress_df.iterrows():
        if row["percentage"] < target_completion:
            attention_needed.append({
                "category": row["category"],
                "current": row["amount"],
                "required": row["required"],
                "remaining": row["required"] - row["amount"]
            })
    
    # Sort by largest gap to target
    attention_needed.sort(key=lambda x: x["remaining"], reverse=True)
    
    # Generate suggestions
    suggestions = []
    
    if current_time < time(10, 30):  # Morning
        suggestions.append("🌅 Good morning! Focus on:")
        categories = ["cereal", "fresh fruit", "milk"]
    elif current_time < time(13, 0):  # Late morning
        suggestions.append("🕙 Mid-morning recommendations:")
        categories = ["dried fruit", "fresh fruit", "legumes"]
    elif current_time < time(16, 30):  # Afternoon
        suggestions.append("🌞 Afternoon focus areas:")
        categories = ["legumes", "vegetables", "cereal"]
    elif current_time < time(19, 30):  # Evening
        suggestions.append("🌆 Evening nutrition goals:")
        categories = ["vegetables", "legumes", "cereal"]
    else:  # Night
        suggestions.append("🌙 Complete your daily targets:")
        categories = ["milk", "fruit", "remaining items"]

    # Add specific suggestions
    for item in attention_needed[:3]:  # Top 3 items needing attention
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
    
    # Split into incomplete and complete categories
    incomplete = []
    complete = []
    for item in category_completion:
        if item['completion'] < 100:
            incomplete.append(item)
        else:
            complete.append(item)
            
    # Sort incomplete by name
    incomplete.sort(key=lambda x: x['category'])
    # Sort complete by name (if you want to maintain order within complete items)
    complete.sort(key=lambda x: x['category'])
    
    # Return incomplete items first, then complete items
    return incomplete + complete

def copy_from_yesterday(target_date_str):
    """Copy diet entries from the previous day to the target date (locally only, without saving to database)"""
    # Calculate yesterday's date based on the target date
    target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    yesterday = target_date - pd.Timedelta(days=1)
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    
    # Load yesterday's entries
    yesterday_entries = load_daily_entries(yesterday_str)
    
    if not yesterday_entries:
        return False, "No entries found for yesterday"
    
    # Update sliders in session state directly without saving to database
    for entry in yesterday_entries:
        category = entry["category"]
        amount = entry["amount"]
        st.session_state[f"slider_{category}"] = float(amount)
    
    return True, f"Copied entries from {yesterday_str} for editing (not saved yet)"

def get_recommendations():
    """Get AI recommendations from the API"""
    response = requests.get(f"{API_URL}/recommendations")
    if response.status_code == 200:
        data = response.json()
        return data.get("recommendations", "No recommendations available")
    return "Failed to get recommendations"


# Sidebar for navigation
page = st.sidebar.selectbox("Select Page", ["Daily Tracking", "View History", "Recommendations"])


if page == "Daily Tracking":
    
    # Add styles
    st.markdown(SLIDER_STYLES, unsafe_allow_html=True)
    
    # Add date selector at the top
    selected_date = st.date_input("Select Date to Edit", date.today())
    selected_date_str = selected_date.strftime("%Y-%m-%d")
    
    # Track if date has changed
    if 'previous_date' not in st.session_state:
        st.session_state.previous_date = selected_date_str
    
    # If date changed, force reload of data
    if st.session_state.previous_date != selected_date_str:
        st.session_state.daily_entries = None  # Clear cached entries
        st.session_state.last_update = None    # Reset last update time
        
        # Reset slider values when changing dates to avoid carrying over values
        for category in DAILY_REQUIREMENTS.keys():
            if f"slider_{category}" in st.session_state:
                del st.session_state[f"slider_{category}"]
        
        # Update the previous date
        st.session_state.previous_date = selected_date_str
    
    # Initialize session state for save button
    if 'save_status' not in st.session_state:
        st.session_state.save_status = ""
    if 'last_saved_values' not in st.session_state:
        st.session_state.last_saved_values = {}
    
    # Update data only when needed
    if (st.session_state.daily_entries is None or 
        st.session_state.last_update is None or 
        (datetime.now() - st.session_state.last_update).seconds > 300):
        st.session_state.daily_entries = load_daily_entries(selected_date_str)
        st.session_state.last_update = datetime.now()
    
    # Calculate and display overall completion at the top
    if st.session_state.daily_entries:
        df = pd.DataFrame(st.session_state.daily_entries)
        if not df.empty:
            # Calculate progress
            progress_df = df.groupby("category")["amount"].sum().reset_index()
            progress_df["required"] = progress_df["category"].map(
                lambda x: DAILY_REQUIREMENTS.get(x, {"amount": 1.0})["amount"]
            )
            progress_df["unit"] = progress_df["category"].map(
                lambda x: DAILY_REQUIREMENTS.get(x, {"unit": "exchange"})["unit"]
            )
            progress_df["percentage"] = (progress_df["amount"] / progress_df["required"] * 100).clip(0, 100)
            
            # Calculate overall completion
            overall_completion = calculate_overall_completion(progress_df)
            target_completion = get_time_based_completion_target()
            
            # Display completion metrics
            col_metric1, col_metric2, col_metric3 = st.columns(3)
            with col_metric1:
                st.metric("Overall Completion", f"{overall_completion:.1f}%")
            with col_metric2:
                st.metric("Target for Current Time", f"{target_completion}%")
            with col_metric3:
                time_remaining = "Calculating..."  # Placeholder for time remaining
                st.metric("Time Until Next Reset", time_remaining)
            
            # Show smart suggestions
            st.subheader("Smart Suggestions")
            suggestions = get_smart_suggestions(overall_completion, target_completion, progress_df)
            for suggestion in suggestions:
                st.markdown(suggestion)
            
            # Add visual separator
            st.markdown("---")
    
    # Create columns with adjusted ratio for mobile
    col1, col2 = st.columns([2, 1])
    
    with col1:
        # Dictionary to store slider values
        slider_values = {}
        consumed = get_consumed_amounts()
        
        # Prepare slider values for all categories first - this ensures they're populated before save
        for category in DAILY_REQUIREMENTS.keys():
            current_value = consumed.get(category, 0)
            slider_values[category] = st.session_state.get(f"slider_{category}", current_value)
        
        # Add Reset, Copy from Yesterday, and Save All Changes buttons at the top
        col_reset, col_copy, col_save = st.columns(3)
        with col_reset:
            if st.button("Reset All Values", type="secondary", use_container_width=True):
                reset_sliders_locally()  # Only reset sliders locally
                st.success("All slider values reset to 0")
                st.rerun()
        with col_copy:
            if st.button("Copy from Yesterday", type="primary", use_container_width=True):
                success, message = copy_from_yesterday(selected_date_str)
                if success:
                    st.success(message)
                    update_progress_data(selected_date_str)
                    st.rerun()
                else:
                    st.error(message)
        with col_save:
            if st.button("Save All Changes", type="primary", use_container_width=True):
                # Log what we're sending to help debugging
                print(f"Saving entries for date: {selected_date_str}")
                print(f"Slider values being saved: {slider_values}")
                
                if save_entries(slider_values, selected_date_str):
                    st.success("Saved!")
                    update_progress_data(selected_date_str)  # Update cache after save
                    st.session_state.pending_changes = 0  # Reset pending changes
                    st.rerun()
                else:
                    st.error("Save failed")
        
        st.markdown("---")
        
        # Sort categories by completion status
        sorted_categories = sort_categories_by_completion(consumed)
        
        # Create more compact sliders for each sorted category
        for cat_info in sorted_categories:
            category = cat_info['category']
            req = cat_info['requirement']
            current_value = consumed.get(category, 0)
            max_value = req["amount"]
            unit = req["unit"]
            completion = cat_info['completion']
            
            # More compact display with completion indicator
            col_label, col_slider = st.columns([1, 2])
            with col_label:
                status_emoji = "⚠️ " if completion < 100 else "✅ "
                st.markdown(f"{status_emoji}**{category.title()}** ({unit})<br>{current_value:.1f}/{max_value:.1f}", unsafe_allow_html=True)
            with col_slider:
                # Use session state value if it exists, otherwise use current_value
                slider_value = st.session_state.get(f"slider_{category}", current_value)
                
                # Update slider value in the UI and store in the dictionary
                slider_values[category] = st.slider(
                    "##",
                    min_value=0.0,
                    max_value=float(max_value),
                    value=slider_value,
                    step=0.5,
                    key=f"slider_{category}",
                    label_visibility="collapsed"
                )
                
                # Track changes for smarter auto-save
                if slider_value != current_value:
                    st.session_state.pending_changes += 1
    
    with col2:
        if st.session_state.daily_entries:
            df = pd.DataFrame(st.session_state.daily_entries)
            if not df.empty:
                progress_df = df.groupby("category")["amount"].sum().reset_index()
                
                # Calculate percentage of daily requirement met with error handling
                def get_requirement(category):
                    if category in DAILY_REQUIREMENTS:
                        return DAILY_REQUIREMENTS[category]["amount"]
                    return 1.0  # Default value for unknown categories
                
                progress_df["required"] = progress_df["category"].map(get_requirement)
                progress_df["percentage"] = (progress_df["amount"] / progress_df["required"] * 100).clip(0, 100)
                
                # Create a more compact bar chart
                fig = px.bar(progress_df,
                            x="category",
                            y="percentage",
                            title="Daily Progress (%)")
                fig.update_layout(
                    height=300,
                    margin=dict(l=10, r=10, t=30, b=10),
                    yaxis_range=[0, 100],
                    xaxis_tickangle=45
                )
                st.plotly_chart(fig, use_container_width=True)
                
                # Compact summary table
                summary = progress_df[["category", "amount", "required"]]
                summary.columns = ["Category", "Consumed", "Required"]
                st.dataframe(
                    summary,
                    hide_index=True,
                    use_container_width=True,
                    height=150
                )
        else:
            st.info("No entries yet")

elif page == "View History":
    # Use the history module's show_history function
    history.show_history(API_URL)

else:  # Recommendations page
    st.header("AI-Powered Recommendations")
    
    if st.button("Get Fresh Recommendations"):
        with st.spinner("Getting AI recommendations..."):
            recommendations = get_recommendations()
            st.write(recommendations)
    
    # Show current progress
    st.subheader("Today's Progress")
    entries = load_daily_entries(date.today().strftime("%Y-%m-%d"))
    if entries:
        df = pd.DataFrame(entries)
        summary = df.groupby("category").agg({
            "amount": "sum"
        }).reset_index()
        
        # Add required amounts and calculate percentage
        summary["required"] = summary["category"].map(lambda x: DAILY_REQUIREMENTS[x]["amount"])
        summary["percentage"] = (summary["amount"] / summary["required"] * 100).round(1)
        summary.columns = ["Category", "Consumed", "Required", "% Complete"]
        
        st.dataframe(summary)
        
        # Visualize progress
        fig = px.bar(summary, 
                    x="Category", 
                    y="% Complete", 
                    title="Daily Requirements Completion (%)")
        fig.update_layout(yaxis_range=[0, 100])
        st.plotly_chart(fig)