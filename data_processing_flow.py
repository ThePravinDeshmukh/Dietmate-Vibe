from prefect import flow, task
import pandas as pd
import requests
from io import StringIO

@task
def fetch_data():
    """Fetch sample CSV data from a public source"""
    # Using a small sample dataset from GitHub
    url = "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
    response = requests.get(url)
    return pd.read_csv(StringIO(response.text))

@task
def process_data(df: pd.DataFrame):
    """Process the Titanic dataset"""
    # Basic data processing
    stats = {
        'total_passengers': len(df),
        'survival_rate': (df['Survived'].mean() * 100),
        'avg_fare': df['Fare'].mean(),
        'avg_age': df['Age'].dropna().mean()
    }
    return stats

@task
def analyze_by_class(df: pd.DataFrame):
    """Analyze survival rates by passenger class"""
    class_stats = df.groupby('Pclass')['Survived'].mean() * 100
    return class_stats.to_dict()

@flow
def analyze_titanic_data():
    print("Fetching Titanic dataset...")
    df = fetch_data()
    
    print("\nProcessing basic statistics...")
    stats = process_data(df)
    print(f"\nBasic Statistics:")
    print(f"Total Passengers: {stats['total_passengers']}")
    print(f"Overall Survival Rate: {stats['survival_rate']:.1f}%")
    print(f"Average Fare: ${stats['avg_fare']:.2f}")
    print(f"Average Age: {stats['avg_age']:.1f} years")
    
    print("\nAnalyzing survival rates by class...")
    class_stats = analyze_by_class(df)
    print("\nSurvival Rates by Class:")
    for pclass, rate in class_stats.items():
        print(f"Class {pclass}: {rate:.1f}%")

if __name__ == "__main__":
    analyze_titanic_data()