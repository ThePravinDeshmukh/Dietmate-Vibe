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
    "valine": {"amount": 4, "unit": "grams"}
}

# Custom CSS styles
CUSTOM_CSS = """
<style>
/* Reset and base styles */
div.stApp {
    background-color: transparent;
}

/* Main container adjustments - reduced padding */
.block-container {
    padding-top: 0.5rem !important;
    padding-bottom: 0 !important;
    max-width: 98% !important;  /* Increased width to reduce side margins */
}

/* Tighter element spacing */
.element-container {
    margin-bottom: 0.25rem !important;
}

/* Tighter block spacing */
div[data-testid="stVerticalBlock"] {
    gap: 0.25rem !important;
    padding: 0 !important;
}

/* Column adjustments - minimal spacing */
.row-widget {
    min-height: 0 !important;
    padding: 0 !important;
}

/* More compact metric styling */
[data-testid="stMetricValue"] {
    font-size: 0.9rem !important;
    line-height: 1.1 !important;
    font-weight: 600 !important;
    margin: 0 !important;
    padding: 0 !important;
}

[data-testid="stMetricDelta"] {
    font-size: 0.75rem !important;
    line-height: 1 !important;
    margin: 0 !important;
    padding: 0 !important;
}

/* Broader sliders */
.stSlider {
    padding: 0.3rem 0 !important;
    margin: 0 !important;
}

div[data-baseweb="slider"] {
    margin: 0.25rem 0 !important; 
    padding: 0 !important;
    width: 100% !important;  /* Make slider use full width */
}

div[data-baseweb="slider"] [role="slider"] {
    height: 1.4rem !important;  /* Bigger thumb */
    width: 1.4rem !important;   /* Bigger thumb */
    margin-top: -0.7rem !important;
}

div[data-baseweb="slider"] [data-testid="stThumbValue"] {
    font-size: 0.8rem !important;
    padding: 0.2rem 0.3rem !important;
}

div[data-baseweb="slider"] [role="progressbar"] {
    height: 0.4rem !important;  /* Thicker track */
}

/* Ultra compact charts */
.js-plotly-plot {
    margin: 0 !important;
}

.plot-container {
    margin: 0 !important;
}

/* Compact text elements */
div.stMarkdown {
    font-size: 0.85rem !important;
    line-height: 1.2 !important;
    margin: 0 !important;
    padding: 0 !important;
}

div.stMarkdown p {
    margin-bottom: 0.1rem !important;
}

/* Compact headers */
h1, h2, h3 {
    margin: 0 0 0.25rem 0 !important;
    padding: 0 !important;
    font-size: 1.1rem !important;
    font-weight: 600 !important;
    line-height: 1.2 !important;
}

/* Compact tables */
.dataframe {
    font-size: 0.8rem !important;
    margin: 0 !important;
}

.dataframe th {
    padding: 0.2rem !important;
}

.dataframe td {
    padding: 0.2rem !important;
}

/* Compact buttons */
.stButton > button {
    padding: 0.2rem 0.8rem !important;
    font-size: 0.85rem !important;
    margin: 0 !important;
}

/* Compact status messages */
.stSuccess, .stInfo, .stError {
    padding: 0.25rem !important;
    font-size: 0.85rem !important;
    margin: 0.25rem 0 !important;
}

/* Compact layout containers */
div[data-testid="stHorizontalBlock"] {
    gap: 0.5rem !important;
    padding: 0 !important;
    margin: 0 !important;
}

/* Chart containers */
[data-testid="column"] > div:has(.js-plotly-plot) {
    padding: 0.25rem !important;
    margin: 0 !important;
}

/* Sidebar adjustments */
section[data-testid="stSidebar"] {
    padding: 0.5rem 0 !important;
}

section[data-testid="stSidebar"] .block-container {
    margin: 0 !important;
    padding: 0 0.5rem !important;
}

/* Radio buttons */
.stRadio > div {
    gap: 0.5rem !important;
}

.stRadio label {
    padding: 0.2rem 0.6rem !important;
    font-size: 0.85rem !important;
}

/* Status widget */
div[data-testid="stStatusWidget"] {
    visibility: hidden !important;
}
</style>
"""