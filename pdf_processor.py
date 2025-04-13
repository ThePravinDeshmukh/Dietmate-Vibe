import pdfplumber
import pandas as pd

pdf_path = "dietpdfs/LEGUMES.pdf"  # Using forward slashes and relative path

data = []

with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            for row in table:
                data.append(row)

# Convert to a DataFrame (you'll likely need to clean this)
df = pd.DataFrame(data)
df.columns = df.iloc[0]  # First row as header
df = df.drop(0).reset_index(drop=True)

print(df.head())
