import streamlit as st
import pandas as pd
import calendar
import requests
from datetime import date, datetime, timedelta
import plotly.express as px
from .utils import normalize_category, get_daily_requirements, calculate_overall_completion

# Import daily requirements
DAILY_REQUIREMENTS = get_daily_requirements()

def load_daily_entries(date_str, api_url):
    """Load entries for a specific date"""
    response = requests.get(f"{api_url}/entries/{date_str}")
    if response.status_code == 200:
        return response.json()
    return []

def calculate_completion_percentage(entries):
    """Calculate diet completion percentage for a day's entries"""
    if not entries:
        return 0.0
    
    df = pd.DataFrame(entries)
    if df.empty:
        return 0.0
        
    df['category'] = df['category'].map(normalize_category)
    progress = df.groupby("category")["amount"].sum().reset_index()
    progress["required"] = progress["category"].map(
        lambda x: DAILY_REQUIREMENTS.get(x, {"amount": 1.0})["amount"]
    )
    progress["percentage"] = (progress["amount"] / progress["required"] * 100).clip(0, 100)
    
    # Calculate weighted average for overall completion
    if not progress.empty:
        weighted_completion = (
            (progress["percentage"] * progress["required"]).sum() / 
            progress["required"].sum()
        )
        return min(weighted_completion, 100.0)
    
    return 0.0

def get_month_data(year, month, api_url):
    """Get diet completion data for all days in a month"""
    month_data = {}
    
    # Get number of days in the month
    num_days = calendar.monthrange(year, month)[1]
    
    # Request data for each day in the month
    for day in range(1, num_days + 1):
        current_date = date(year, month, day)
        date_str = current_date.strftime("%Y-%m-%d")
        
        if current_date <= date.today():  # Only get data for past and current days
            entries = load_daily_entries(date_str, api_url)
            completion = calculate_completion_percentage(entries)
        else:
            completion = None  # Future date
            
        month_data[day] = completion
        
    return month_data

def show_month_calendar(year, month, month_data):
    """Display a calendar-like month view with diet completion percentages"""
    # Get month name and number of days
    month_name = calendar.month_name[month]
    num_days = calendar.monthrange(year, month)[1]
    
    st.subheader(f"{month_name} {year}")
    
    # First determine the starting day of the week (0 = Monday, 6 = Sunday)
    first_day_weekday = calendar.monthrange(year, month)[0]
    
    # Create a table to represent the calendar
    html_calendar = """
    <style>
    .calendar-container {
        width: 100%;
        padding: 10px;
    }
    .calendar-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
    }
    .calendar-table th {
        background-color: #f1f1f1;
        padding: 8px;
        text-align: center;
        font-weight: bold;
        border: 1px solid #ddd;
    }
    .calendar-table td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: center;
        height: 80px;
        width: 14.28%;
        vertical-align: top;
        position: relative;
    }
    .day-number {
        font-size: 14px;
        font-weight: bold;
        position: absolute;
        top: 5px;
        left: 5px;
    }
    .completion {
        font-size: 14px;
        display: flex;
        height: 100%;
        align-items: center;
        justify-content: center;
    }
    .completion-circle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto;
        font-weight: bold;
    }
    .green { background-color: rgba(0, 128, 0, 0.2); color: green; }
    .limegreen { background-color: rgba(50, 205, 50, 0.2); color: limegreen; }
    .orange { background-color: rgba(255, 165, 0, 0.2); color: orange; }
    .red { background-color: rgba(255, 0, 0, 0.2); color: red; }
    .future { color: #aaa; }
    .empty-cell { height: 80px; }
    </style>
    <div class="calendar-container">
    <table class="calendar-table">
        <thead>
            <tr>
                <th>Mon</th>
                <th>Tue</th>
                <th>Wed</th>
                <th>Thu</th>
                <th>Fri</th>
                <th>Sat</th>
                <th>Sun</th>
            </tr>
        </thead>
        <tbody>
    """
    
    # Add rows for the weeks
    day_counter = 1
    for week in range(6):  # Maximum 6 weeks in a calendar view
        html_calendar += "<tr>"
        
        for weekday in range(7):  # 7 days in a week
            # Skip cells before the start of the month or after the end
            if (week == 0 and weekday < first_day_weekday) or (day_counter > num_days):
                html_calendar += '<td class="empty-cell">&nbsp;</td>'
            else:
                completion = month_data.get(day_counter)
                
                html_calendar += '<td>'
                html_calendar += f'<div class="day-number">{day_counter}</div>'
                
                # Add completion percentage with appropriate color
                if completion is not None:
                    # Create a color based on completion percentage
                    if completion >= 90:
                        color_class = "green"
                    elif completion >= 70:
                        color_class = "limegreen"
                    elif completion >= 50:
                        color_class = "orange"
                    else:
                        color_class = "red"
                        
                    html_calendar += f'<div class="completion"><div class="completion-circle {color_class}">{completion:.0f}%</div></div>'
                else:
                    html_calendar += '<div class="completion"><div class="completion-circle future">-</div></div>'
                
                html_calendar += "</td>"
                
                day_counter += 1
                
        html_calendar += "</tr>"
        
        # Stop if we've used all days in the month
        if day_counter > num_days:
            break
            
    html_calendar += """
        </tbody>
    </table>
    </div>
    """
    
    # Render the HTML calendar
    st.markdown(html_calendar, unsafe_allow_html=True)

def show_history(api_url):
    """Display history view with weekly and monthly views"""
    st.header("Diet History")
    
    # Add tabs for different views (removed Daily View)
    tab1, tab2 = st.tabs(["7-Day History", "Month View"])
    
    with tab1:
        # Weekly view (simplified)
        st.subheader("7-Day History")
        end_date = date.today()
        start_date = end_date - timedelta(days=6)
        
        weekly_data = {}
        for i in range(7):
            current_date = start_date + timedelta(days=i)
            date_str = current_date.strftime("%Y-%m-%d")
            entries = load_daily_entries(date_str, api_url)
            completion = calculate_completion_percentage(entries)
            weekly_data[current_date.strftime("%a %d")] = completion
        
        # Create a simple bar chart
        if weekly_data:
            df = pd.DataFrame({
                "Date": list(weekly_data.keys()),
                "Completion": list(weekly_data.values())
            })
            
            fig = px.bar(
                df,
                x="Date",
                y="Completion",
                title="7-Day Completion History",
                labels={"Completion": "Completion %"},
                text=df["Completion"].round(1).astype(str) + "%"
            )
            
            fig.update_layout(yaxis_range=[0, 100])
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No history data available")
    
    with tab2:
        # Month view
        st.subheader("Monthly Diet Completion")
        
        # Month selector
        today = date.today()
        col1, col2 = st.columns(2)
        with col1:
            selected_month = st.selectbox("Month", 
                                         range(1, 13),
                                         index=today.month - 1,
                                         format_func=lambda x: calendar.month_name[x])
        with col2:
            selected_year = st.selectbox("Year", 
                                        range(today.year - 2, today.year + 1),
                                        index=2)
        
        # Get month data
        month_data = get_month_data(selected_year, selected_month, api_url)
        
        # Show calendar view
        show_month_calendar(selected_year, selected_month, month_data)
        
        # Show monthly statistics
        valid_values = [v for v in month_data.values() if v is not None]
        if valid_values:
            avg_completion = sum(valid_values) / len(valid_values)
            st.metric("Monthly Average Completion", f"{avg_completion:.1f}%")
            
            # Show days with best and worst completion
            if len(valid_values) > 1:
                days_by_completion = {day: completion for day, completion in month_data.items() 
                                     if completion is not None}
                
                best_day = max(days_by_completion, key=days_by_completion.get)
                worst_day = min(days_by_completion, key=days_by_completion.get)
                
                col1, col2 = st.columns(2)
                with col1:
                    st.metric("Best Day", 
                             f"{calendar.month_name[selected_month]} {best_day}",
                             f"{days_by_completion[best_day]:.1f}%")
                with col2:
                    st.metric("Needs Improvement", 
                             f"{calendar.month_name[selected_month]} {worst_day}",
                             f"{days_by_completion[worst_day]:.1f}%")
        else:
            st.info("No data available for the selected month")