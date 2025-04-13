import os
import pdfplumber
import pandas as pd
from pathlib import Path
import warnings

# Suppress pdfplumber warnings about CropBox
warnings.filterwarnings('ignore', message='.*CropBox.*')

class DietDataProcessor:
    def __init__(self, pdf_directory="dietpdfs"):
        self.pdf_directory = pdf_directory
        self.food_categories = {}

    def process_pdf(self, pdf_path):
        category_name = Path(pdf_path).stem.replace(" exchange", "").replace(" Exchange", "").lower()
        data = []
        
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        if row and any(row):  # Skip empty rows
                            data.append(row)
        
        if not data:
            return None
            
        df = pd.DataFrame(data)
        if len(df) > 0:
            df.columns = df.iloc[0]  # First row as header
            df = df.drop(0).reset_index(drop=True)
            # Clean column names
            df.columns = df.columns.str.strip()
            # Clean data
            df = df.apply(lambda x: x.str.strip() if isinstance(x, pd.Series) else x)
            return {category_name: df}
        return None

    def process_all_pdfs(self):
        for filename in os.listdir(self.pdf_directory):
            if filename.endswith('.pdf'):
                pdf_path = os.path.join(self.pdf_directory, filename)
                result = self.process_pdf(pdf_path)
                if result:
                    self.food_categories.update(result)
        return self.food_categories

    def get_food_choices(self, category):
        """Get all food choices for a given category"""
        return self.food_categories.get(category.lower(), pd.DataFrame())

if __name__ == "__main__":
    # Test the processor
    processor = DietDataProcessor()
    categories = processor.process_all_pdfs()
    print("Processed categories:", list(categories.keys()))