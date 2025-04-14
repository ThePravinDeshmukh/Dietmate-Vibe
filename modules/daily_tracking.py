import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, date, time
import requests

from .utils import (
    normalize_category,
    calculate_overall_completion,
    get_time_based_completion_target,
    get_hours_until_midnight,
    get_smart_suggestions,
    sort_categories_by_completion
)

def load_daily_entries(date_str, api_url, cache_ttl=300):
    """Load daily entries with caching"""
    print(f"Loading entries for {date_str}")
    response = requests.get(f"{api_url}/entries/{date_str}")
    if response.status_code == 200:
        data = response.json()
        # Initialize all categories with 0 if they don't exist
        all_entries = {category: 0.0 for category in DAILY_REQUIREMENTS.keys()}
        # Update with actual values from database
        for entry in data:
            category = normalize_category(entry['category'])
            all_entries[category] = float(entry['amount'])
        
        return [
            {
                "category": cat,
                "amount": amt,
                "unit": DAILY_REQUIREMENTS.get(cat, {"unit": "exchange"})["unit"]
            }
            for cat, amt in all_entries.items()
        ]
    return []

def save_entries(entries, api_url):
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
        f"{api_url}/entries/batch",
        json={"entries": entries_list}
    )
    return response.status_code == 200

def reset_all_values(api_url):
    """Reset all values to 0 in the database"""
    response = requests.post(f"{api_url}/entries/reset")
    return response.status_code == 200

def show_daily_tracking(api_url):
    st.header("Daily Food Tracking", divider='rainbow')
    
    # Add styles for sliders and layout
    st.markdown("""
        <style>
            /* Green color for completed sliders */
            div[data-testid="stSlider"][aria-valuenow="100"] .stSlider > div > div > div {
                background-color: #28a745 !important;
            }
            div[data-testid="stSlider"][aria-valuenow="100"] .stSlider > div > div > div > div {
                background-color: #1e7e34 !important;
            }
            
            /* Remove extra spacing */
            .block-container {padding-top: 1rem; padding-bottom: 0rem;}
            .element-container {margin: 0.5rem 0;}
            div[data-testid="stVerticalBlock"] > div {margin-bottom: 0.5rem;}
        </style>
    """, unsafe_allow_html=True)
    
    # Update data when needed
    if (st.session_state.daily_entries is None or 
        st.session_state.last_update is None or 
        (datetime.now() - st.session_state.last_update).seconds > CACHE_TTL):
        st.session_state.daily_entries = load_daily_entries(date.today().strftime("%Y-%m-%d"), api_url)
        st.session_state.last_update = datetime.now()
    
    # Display overall completion metrics
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
            
            # Calculate metrics
            overall_completion = calculate_overall_completion(progress_df)
            target_completion = get_time_based_completion_target()
            
            # Display metrics in columns
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
            
            st.markdown("---")
    
    # Create layout columns
    col1, col2 = st.columns([2, 1])
    
    with col1:
        # Add Reset button
        if st.button("Reset All Values", type="secondary"):
            if reset_all_values(api_url):
                st.success("All values reset to 0")
                st.rerun()
            else:
                st.error("Failed to reset values")
        
        st.markdown("---")
        
        # Show sliders for each category
        slider_values = {}
        consumed = {entry["category"]: entry["amount"] for entry in st.session_state.daily_entries or []}
        sorted_categories = sort_categories_by_completion(consumed)
        
        for cat_info in sorted_categories:
            category = cat_info['category']
            req = DAILY_REQUIREMENTS[category]
            current_value = consumed.get(category, 0)
            max_value = req["amount"]
            unit = req["unit"]
            completion = cat_info['completion']
            
            col_label, col_slider = st.columns([1, 2])
            with col_label:
                status_emoji = "⚠️ " if completion < 100 else "✅ "
                st.markdown(f"{status_emoji}**{category.title()}** ({unit})<br>{current_value:.1f}/{max_value:.1f}", unsafe_allow_html=True)
            with col_slider:
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
            if save_entries(slider_values, api_url):
                st.success("Saved!")
                st.session_state.daily_entries = load_daily_entries(date.today().strftime("%Y-%m-%d"), api_url)
                st.session_state.last_update = datetime.now()
                st.rerun()
            else:
                st.error("Save failed")
    
    with col2:
        # Show progress visualization
        if st.session_state.daily_entries:
            df = pd.DataFrame(st.session_state.daily_entries)
            if not df.empty:
                progress_df = df.groupby("category")["amount"].sum().reset_index()
                progress_df["required"] = progress_df["category"].map(
                    lambda x: DAILY_REQUIREMENTS[x]["amount"]
                )
                progress_df["percentage"] = (progress_df["amount"] / progress_df["required"] * 100).clip(0, 100)
                
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