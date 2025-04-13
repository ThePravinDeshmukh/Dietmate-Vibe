# Diet Tracking System

A specialized diet tracking system built for managing a child's daily dietary requirements with prescribed food categories and exchanges.

## Features

- Track daily food consumption by category
- Visual progress tracking with percentage completion
- AI-powered recommendations for balanced meal planning
- Historical view of diet patterns
- Support for different units (exchanges, grams, ml)

## Requirements

- Python 3.10+
- FastAPI
- Streamlit
- SQLite
- OpenAI API key (for recommendations)
- PDF files containing food exchange lists

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd <repo-name>
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
Create a `.env` file with:
```
OPENAI_API_KEY=your_api_key_here
DATABASE_URL=sqlite:///diet_tracker.db
```

4. Initialize the database:
```bash
python init_db.py
```

## Running the Application

1. Start the FastAPI backend:
```bash
uvicorn api:app --reload
```

2. In a separate terminal, start the Streamlit frontend:
```bash
streamlit run app.py
```

The application will be available at:
- Frontend: http://localhost:8501
- API Documentation: http://localhost:8000/docsta

## Project Structure

- `api.py`: FastAPI backend server
- `app.py`: Streamlit frontend
- `models.py`: Database models
- `diet_data_processor.py`: PDF processing for food exchanges
- `init_db.py`: Database initialization
- `dietpdfs/`: Directory containing food exchange PDFs