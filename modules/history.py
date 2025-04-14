import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import date
from .utils import normalize_category

def show_history(api_url):
    st.header("Diet History")
    
    # Date selector
    selected_date = st.date_input("Select Date", date.today())
    
    # Load entries for selected date
    response = requests.get(f"{api_url}/entries/{selected_date.strftime('%Y-%m-%d')}")
    if response.status_code == 200:
        entries = response.json()
        if entries:
            df = pd.DataFrame(entries)
            # Normalize category names
            df['category'] = df['category'].map(normalize_category)
            
            # Show daily summary with percentage of requirements met
            st.subheader("Daily Summary")
            summary = df.groupby("category")["amount"].sum().reset_index()
            
            # Calculate requirements
            summary["required"] = summary["category"].map(
                lambda x: DAILY_REQUIREMENTS.get(x, {"amount": 1.0})["amount"]
            )
            summary["percentage"] = (summary["amount"] / summary["required"] * 100).round(1)
            summary.columns = ["Category", "Total Amount", "Required", "% Complete"]
            
            # Display summary table
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