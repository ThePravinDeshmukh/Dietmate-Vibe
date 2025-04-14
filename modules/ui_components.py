import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime
from .config import DAILY_REQUIREMENTS, CUSTOM_CSS
from .progress import (
    calculate_overall_completion,
    get_time_based_completion_target,
    get_smart_suggestions,
    sort_categories_by_completion,
    get_hours_until_midnight
)

def setup_page():
    """Configure initial page settings and style"""
    st.set_page_config(
        page_title="Diet Tracker",
        layout="wide",
        initial_sidebar_state="expanded",
        menu_items={
            'Get Help': None,
            'Report a bug': None,
            'About': None
        }
    )
    st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

def render_header():
    """Render the page header with overall progress"""
    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        st.title("Diet Tracker")
    with col2:
        st.metric("Time Until Reset", get_hours_until_midnight())
    with col3:
        if st.button("Reset All Values"):
            from .data_service import reset_all_values
            if reset_all_values():
                st.session_state.daily_entries = None
                st.session_state.last_update = None
                st.experimental_rerun()

def render_progress_metrics(progress_df):
    """Render progress metrics and charts"""
    overall_completion = calculate_overall_completion(progress_df)
    target_completion = get_time_based_completion_target()
    
    col1, col2 = st.columns(2)
    with col1:
        st.metric(
            "Overall Completion", 
            f"{overall_completion:.1f}%",
            f"{overall_completion - target_completion:.1f}% vs target"
        )
    with col2:
        st.metric(
            "Target Completion", 
            f"{target_completion:.1f}%",
            f"{get_hours_until_midnight()} until reset"
        )
    
    # Progress chart
    fig = px.bar(
        progress_df,
        x="category",
        y="percentage",
        title="Category Progress",
        labels={"category": "Category", "percentage": "Completion %"}
    )
    fig.add_hline(
        y=target_completion,
        line_dash="dash",
        line_color="red",
        annotation_text=f"Target ({target_completion:.0f}%)"
    )
    st.plotly_chart(fig, use_container_width=True)

def render_smart_suggestions(progress_df):
    """Render AI-powered smart suggestions"""
    overall_completion = calculate_overall_completion(progress_df)
    target_completion = get_time_based_completion_target()
    
    suggestions = get_smart_suggestions(overall_completion, target_completion, progress_df)
    
    st.subheader("Smart Suggestions")
    for suggestion in suggestions:
        st.markdown(suggestion)

def render_category_sliders(consumed_amounts):
    """Render sliders for each category"""
    sorted_categories = sort_categories_by_completion(consumed_amounts)
    
    changes = {}
    col1, col2 = st.columns(2)
    
    for i, category_info in enumerate(sorted_categories):
        category = category_info['category']
        requirement = category_info['requirement']
        current = consumed_amounts.get(category, 0)
        
        with col1 if i % 2 == 0 else col2:
            new_value = st.slider(
                f"{category.title()} ({requirement['unit']})",
                0.0,
                float(requirement['amount']),
                float(current),
                0.1,
                key=f"slider_{category}"
            )
            
            if abs(new_value - current) > 0.01:  # Check for meaningful change
                changes[category] = new_value
    
    return changes

def render_save_button(changes):
    """Render save button and handle saving changes"""
    if changes:
        if st.button("Save Changes", key="save_changes"):
            from .data_service import save_entries
            if save_entries(changes):
                st.success("Changes saved successfully!")
                st.session_state.last_saved_values = changes.copy()
                st.experimental_rerun()
            else:
                st.error("Failed to save changes")

def initialize_session_state():
    """Initialize session state variables"""
    if 'initialized' not in st.session_state:
        st.session_state.initialized = False
        st.session_state.daily_entries = None
        st.session_state.last_update = None
        st.session_state.save_status = ""
        st.session_state.last_saved_values = {}