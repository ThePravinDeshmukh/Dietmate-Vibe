import streamlit as st
import pandas as pd
import requests
from datetime import datetime, date, time
import plotly.express as px

# API endpoint
API_URL = "http://localhost:8000"

st.set_page_config(page_title="Diet Tracker", layout="wide")

# Initialize session state for caching
if 'daily_entries' not in st.session_state:
    st.session_state.daily_entries = None
if 'last_update' not in st.session_state:
    st.session_state.last_update = None

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
    "valine": {"amount": 4, "unit": "grams"},
    "candies": {"amount": 2, "unit": "exchange"}
}

# Add CSS for slider colors and floating button
SLIDER_STYLES = """
<style>
    /* Green color for completed sliders */
    div[data-testid="stSlider"][aria-valuenow="100"] .stSlider > div > div > div {
        background-color: #28a745 !important;
    }
    div[data-testid="stSlider"][aria-valuenow="100"] .stSlider > div > div > div > div {
        background-color: #1e7e34 !important;
    }
    
    /* Floating save button */
    .floating-save-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        background-color: #2ecc40;
        color: white;
        padding: 15px 30px;
        border-radius: 30px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-weight: bold;
    }
    
    .floating-save-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 12px rgba(0,0,0,0.3);
    }
    
    /* Animation for save success */
    @keyframes saveSuccess {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
    }
    
    .save-success {
        animation: saveSuccess 0.5s ease;
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

def save_entries(entries):
    """Save multiple entries in a single request"""
    entries_list = [
        {
            "food_item": category,
            "category": category,
            "amount": float(amount),
            "unit": DAILY_REQUIREMENTS[category]["unit"],
            "notes": "Updated via slider"
        }
        for category, amount in entries.items()
    ]
    
    response = requests.post(
        f"{API_URL}/entries/batch",
        json={"entries": entries_list}
    )
    return response.status_code == 200

def update_progress_data():
    """Update cached daily entries"""
    today = date.today().strftime("%Y-%m-%d")
    # Clear the cache before updating
    load_daily_entries.clear()
    st.session_state.daily_entries = load_daily_entries(today)
    st.session_state.last_update = datetime.now()

def get_consumed_amounts():
    """Get current consumed amounts from cached data"""
    consumed = {category: 0.0 for category in DAILY_REQUIREMENTS.keys()}
    if st.session_state.daily_entries:
        for entry in st.session_state.daily_entries:
            category = entry['category']
            consumed[category] = float(entry['amount'])
    return consumed

def reset_all_values():
    """Reset all values to 0 in the database and clear session state"""
    # Call the reset endpoint
    response = requests.post(f"{API_URL}/entries/reset")
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

def get_hours_until_midnight():
    """Calculate hours and minutes remaining until midnight"""
    now = datetime.now()
    midnight = (now + pd.Timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    delta = midnight - now
    hours = delta.total_seconds() / 3600
    minutes = (hours % 1) * 60
    return f"{int(hours)}h {int(minutes)}m"

def get_recommendations():
    """Get AI recommendations from the API"""
    response = requests.get(f"{API_URL}/recommendations")
    if response.status_code == 200:
        data = response.json()
        return data.get("recommendations", "No recommendations available")
    return "Failed to get recommendations"

st.title("Child Diet Tracking System")

# Sidebar for navigation
page = st.sidebar.selectbox("Select Page", ["Daily Tracking", "View History", "Recommendations"])

if page == "Daily Tracking":
    st.header("Daily Food Tracking", divider='rainbow')
    
    # Add styles
    st.markdown(SLIDER_STYLES, unsafe_allow_html=True)
    
    # Initialize session state for save button
    if 'save_status' not in st.session_state:
        st.session_state.save_status = ""
    if 'last_saved_values' not in st.session_state:
        st.session_state.last_saved_values = {}
    
    # Function to check if there are unsaved changes
    def has_unsaved_changes():
        current_values = {k: v for k, v in st.session_state.items() if k.startswith('slider_')}
        return current_values != st.session_state.last_saved_values
    
    # Remove extra spacing
    st.markdown("""
        <style>
            .block-container {padding-top: 1rem; padding-bottom: 0rem;}
            .element-container {margin: 0.5rem 0;}
            div[data-testid="stVerticalBlock"] > div {margin-bottom: 0.5rem;}
        </style>
    """, unsafe_allow_html=True)
    
    # Update data only when needed
    if (st.session_state.daily_entries is None or 
        st.session_state.last_update is None or 
        (datetime.now() - st.session_state.last_update).seconds > 300):
        update_progress_data()
    
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
                time_remaining = get_hours_until_midnight()
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
        
        # Add Reset button at the top
        if st.button("Reset All Values", type="secondary"):
            if reset_all_values():
                st.success("All values reset to 0")
                st.rerun()
            else:
                st.error("Failed to reset values")
        
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
                
                slider_values[category] = st.slider(
                    "##",
                    min_value=0.0,
                    max_value=float(max_value),
                    value=slider_value,
                    step=0.5,
                    key=f"slider_{category}",
                    label_visibility="collapsed"
                )
        
        if st.button("Save All Changes", use_container_width=True):
            if save_entries(slider_values):
                st.success("Saved!")
                update_progress_data()  # Update cache after save
                st.rerun()
            else:
                st.error("Save failed")
    
    # Create floating save button with dynamic state
    save_button_color = "#2ecc40" if has_unsaved_changes() else "#888888"
    save_button_html = f"""
        <div class="floating-save-button" style="background-color: {save_button_color}"
             onclick="document.dispatchEvent(new CustomEvent('saveChanges'))">
            💾 Save Changes
        </div>
    """
    
    # Add JavaScript to handle save button click
    st.markdown("""
        <script>
            document.addEventListener('saveChanges', function() {
                window.streamlit.setComponentValue('save_clicked', true);
            });
        </script>
    """, unsafe_allow_html=True)
    
    # Display floating save button
    st.markdown(save_button_html, unsafe_allow_html=True)
    
    # Handle save operation
    if st.session_state.get('save_clicked', False):
        st.session_state.save_clicked = False  # Reset click state
        if save_entries(slider_values):
            st.session_state.last_saved_values = {k: v for k, v in st.session_state.items() if k.startswith('slider_')}
            st.session_state.save_status = "success"
            update_progress_data()
            st.rerun()
        else:
            st.session_state.save_status = "error"
            st.error("Failed to save changes")
    
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
    st.header("Diet History")
    
    # Date selector
    selected_date = st.date_input("Select Date", date.today())
    entries = load_daily_entries(selected_date.strftime("%Y-%m-%d"))
    
    if entries:
        df = pd.DataFrame(entries)
        # Normalize category names
        df['category'] = df['category'].map(normalize_category)
        
        # Show daily summary with percentage of requirements met
        st.subheader("Daily Summary")
        summary = df.groupby("category")["amount"].sum().reset_index()
        
        # Calculate requirements with error handling
        def get_requirement(category):
            normalized = normalize_category(category)
            if normalized in DAILY_REQUIREMENTS:
                return DAILY_REQUIREMENTS[normalized]["amount"]
            return 1.0  # Default value for unknown categories
            
        summary["required"] = summary["category"].map(get_requirement)
        summary["percentage"] = (summary["amount"] / summary["required"] * 100).round(1)
        summary.columns = ["Category", "Total Amount", "Required", "% Complete"]
        st.dataframe(summary)
        
        # Visualize completion percentage
        fig = px.bar(summary, 
                    x="Category", 
                    y="% Complete",
                    title="Daily Requirements Completion")
        fig.update_layout(yaxis_range=[0, 100])
        st.plotly_chart(fig)
        
    else:
        st.info("No entries found for selected date")

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
# Removed invalid backticks