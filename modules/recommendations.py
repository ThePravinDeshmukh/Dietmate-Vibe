import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, date
import openai
from .utils import normalize_category, get_daily_requirements

def get_meal_recommendations(api_url, openai_api_key):
    """Generate AI-powered meal recommendations based on current progress"""
    
    # Get today's entries
    response = requests.get(f"{api_url}/entries/{date.today().strftime('%Y-%m-%d')}")
    if response.status_code != 200:
        return "Unable to fetch current progress"
    
    entries = response.json()
    df = pd.DataFrame(entries) if entries else pd.DataFrame()
    
    # Calculate remaining requirements
    requirements = get_daily_requirements()
    current_totals = df.groupby('category')['amount'].sum() if not df.empty else pd.Series()
    
    remaining = {}
    for category, req in requirements.items():
        consumed = current_totals.get(category, 0)
        if consumed < req['amount']:
            remaining[category] = {
                'amount': req['amount'] - consumed,
                'unit': req['unit']
            }
    
    if not remaining:
        return "All daily requirements have been met!"
    
    # Format the requirements for the AI prompt
    requirements_text = "\n".join([
        f"- {cat.title()}: {details['amount']:.1f} {details['unit']}"
        for cat, details in remaining.items()
    ])
    
    prompt = f"""Based on the following remaining daily requirements:

{requirements_text}

Provide 2-3 meal suggestions that would help meet these requirements. Consider:
1. Combining foods from different categories when possible
2. Practical portion sizes
3. Kid-friendly options

Format as a bullet-point list."""

    try:
        openai.api_key = openai_api_key
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful dietitian specializing in meal planning for children with special dietary needs."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=300
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error generating recommendations: {str(e)}"

def show_recommendations(api_url):
    st.header("Smart Recommendations", divider='rainbow')
    
    if 'OPENAI_API_KEY' not in st.secrets:
        st.error("OpenAI API key not configured")
        return
    
    recommendations = get_meal_recommendations(api_url, st.secrets['OPENAI_API_KEY'])
    st.write(recommendations)
    
    # Show tips based on historical data
    st.subheader("Tips from Historical Data")
    
    # Get last 7 days of data
    end_date = date.today()
    start_date = end_date - timedelta(days=7)
    response = requests.get(
        f"{api_url}/entries/range",
        params={'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d')}
    )
    
    if response.status_code == 200:
        entries = response.json()
        if entries:
            df = pd.DataFrame(entries)
            df['date'] = pd.to_datetime(df['date'])
            
            # Calculate daily completion rates
            daily_completion = df.groupby(['date', 'category'])['amount'].sum().reset_index()
            daily_completion['required'] = daily_completion['category'].map(
                lambda x: DAILY_REQUIREMENTS[x]['amount']
            )
            daily_completion['completion'] = (daily_completion['amount'] / daily_completion['required'] * 100).clip(0, 100)
            
            # Find challenging categories
            avg_completion = daily_completion.groupby('category')['completion'].mean()
            challenging = avg_completion[avg_completion < 80].sort_values()
            
            if not challenging.empty:
                st.write("Categories that need more attention:")
                for cat, completion in challenging.items():
                    st.write(f"- {cat.title()}: {completion:.1f}% average completion")
            else:
                st.success("Great job! All categories are being well managed.")