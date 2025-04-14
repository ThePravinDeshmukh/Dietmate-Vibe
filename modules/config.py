import os

# API endpoint
API_URL = os.getenv('API_URL', 'http://localhost:8000')

# Cache settings
CACHE_TTL = 300  # 5 minutes

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

# Custom CSS styles
CUSTOM_CSS = """
    /* Reduce spacing in the main container */
    .block-container {
        padding-top: 1rem !important;
        padding-bottom: 0rem !important;
        margin-top: -2rem;
    }
    
    /* Reduce spacing between elements */
    .element-container {
        margin: 0.25rem 0 !important;
    }
    
    /* Make vertical blocks more compact */
    div[data-testid="stVerticalBlock"] > div {
        margin-bottom: 0.25rem !important;
        padding-bottom: 0 !important;
    }
    
    /* Reduce padding in columns */
    .stColumn {
        padding: 0.5rem !important;
    }
    
    /* More compact headers */
    h1, h2, h3 {
        margin: 0 !important;
        padding: 0.2rem 0 !important;
    }
    
    /* Compact dataframe display */
    .dataframe {
        margin: 0 !important;
        padding: 0.2rem !important;
    }
    
    /* Reduce slider padding */
    .stSlider {
        padding: 0.2rem 0 !important;
    }
    
    /* Make metric containers more compact */
    [data-testid="stMetricValue"] {
        font-size: 1.2rem !important;
    }
    
    /* Sidebar adjustments */
    .css-1d391kg {
        padding-top: 1rem !important;
    }
    
    /* More compact buttons */
    .stButton button {
        padding: 0.2rem 1rem !important;
    }
    
    /* Green color for completed sliders */
    div[data-testid="stSlider"][aria-valuenow="100"] .stSlider > div > div > div {
        background-color: #28a745 !important;
    }
    div[data-testid="stSlider"][aria-valuenow="100"] .stSlider > div > div > div > div {
        background-color: #1e7e34 !important;
    }
"""