import streamlit as st
import pandas as pd
import requests
from datetime import datetime, date
import plotly.express as px

# API endpoint
API_URL = "http://localhost:8000"

st.set_page_config(page_title="Diet Tracker", layout="wide")
st.title("Child Diet Tracking System")

# Sidebar for navigation
page = st.sidebar.selectbox("Select Page", ["Daily Tracking", "View History", "Recommendations"])

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

def load_daily_entries(date_str):
    response = requests.get(f"{API_URL}/entries/{date_str}")
    if response.status_code == 200:
        return response.json()
    return []

def save_entries(entries):
    success = True
    for category, amount in entries.items():
        if amount > 0:  # Only save non-zero values
            data = {
                "food_item": category,  # Using category as food item
                "category": category,
                "amount": float(amount),  # Ensure amount is float
                "unit": DAILY_REQUIREMENTS[category]["unit"],
                "notes": "Updated via slider"
            }
            response = requests.post(f"{API_URL}/entries/", json=data)
            if response.status_code != 200:
                print(f"Error saving {category}: {response.text}")  # Debug info
                success = False
    return success

def get_recommendations():
    response = requests.get(f"{API_URL}/recommendations")
    if response.status_code == 200:
        return response.json()["recommendations"]
    return "Unable to get recommendations at this time."

if page == "Daily Tracking":
    st.header("Daily Food Tracking")
    
    # Create two columns
    col1, col2 = st.columns([3, 2])
    
    with col1:
        st.subheader("Food Category Sliders")
        # Dictionary to store slider values
        
        slider_values = {}
        
        # Get today's entries to show current progress
        today_entries = load_daily_entries(date.today().strftime("%Y-%m-%d"))
        consumed = {}
        if today_entries:
            for entry in today_entries:
                category = entry['category']
                consumed[category] = consumed.get(category, 0) + entry['amount']
        
        # Create sliders for each category
        for category, req in DAILY_REQUIREMENTS.items():
            current_value = consumed.get(category, 0)
            max_value = req["amount"]
            unit = req["unit"]
            
            # Show current consumption vs total required
            st.write(f"**{category.title()}** ({unit})")
            st.write(f"Consumed: {current_value:.1f} / Required: {max_value:.1f}")
            
            slider_values[category] = st.slider(
                f"Add {category}",
                min_value=0.0,
                max_value=float(max_value),
                value=0.0,
                step=0.1,
                key=f"slider_{category}"
            )
        
        if st.button("Save All Changes"):
            if save_entries(slider_values):
                st.success("Successfully saved all entries!")
                # Clear all sliders by rerunning the app
                st.rerun()
            else:
                st.error("Failed to save some entries")
    
    with col2:
        # Show today's progress
        st.subheader("Today's Progress")
        entries = load_daily_entries(date.today().strftime("%Y-%m-%d"))
        if entries:
            df = pd.DataFrame(entries)
            progress_df = df.groupby("category")["amount"].sum().reset_index()
            
            # Calculate percentage of daily requirement met
            progress_df["required"] = progress_df["category"].map(lambda x: DAILY_REQUIREMENTS[x]["amount"])
            progress_df["percentage"] = (progress_df["amount"] / progress_df["required"] * 100).clip(0, 100)
            
            # Create a bar chart showing percentage complete for each category
            fig = px.bar(progress_df,
                        x="category",
                        y="percentage",
                        title="Daily Progress (%)",
                        labels={"percentage": "% Complete", "category": "Category"})
            fig.update_layout(yaxis_range=[0, 100])
            st.plotly_chart(fig)
            
            # Show numerical summary
            st.subheader("Summary")
            summary = progress_df[["category", "amount", "required"]]
            summary.columns = ["Category", "Consumed", "Required"]
            st.dataframe(summary)
        else:
            st.info("No entries for today yet")

elif page == "View History":
    st.header("Diet History")
    
    # Date selector
    selected_date = st.date_input("Select Date", date.today())
    entries = load_daily_entries(selected_date.strftime("%Y-%m-%d"))
    
    if entries:
        df = pd.DataFrame(entries)
        
        # Show daily summary with percentage of requirements met
        st.subheader("Daily Summary")
        summary = df.groupby("category")["amount"].sum().reset_index()
        summary["required"] = summary["category"].map(lambda x: DAILY_REQUIREMENTS[x]["amount"])
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