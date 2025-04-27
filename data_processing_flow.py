from prefect import flow, task
import pandas as pd
import requests
from io import StringIO
from typing import Dict, Any

@task(retries=2)
def fetch_data() -> pd.DataFrame:
    """Fetch sample CSV data from a public source
    
    Returns:
        pd.DataFrame: Titanic dataset with passenger information
        
    Raises:
        requests.RequestException: If data fetching fails
    """
    # Using a small sample dataset from GitHub
    url = "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise exception for HTTP errors
        return pd.read_csv(StringIO(response.text))
    except requests.RequestException as e:
        raise requests.RequestException(f"Failed to fetch data: {e}")

@task
def process_data(df: pd.DataFrame) -> Dict[str, Any]:
    """Process the Titanic dataset
    
    Args:
        df: DataFrame containing the Titanic passenger data
        
    Returns:
        Dict[str, Any]: Dictionary of computed statistics
    """
    # Basic data processing
    stats = {
        'total_passengers': len(df),
        'survival_rate': (df['Survived'].mean() * 100),
        'avg_fare': df['Fare'].mean(),
        'avg_age': df['Age'].dropna().mean()
    }
    return stats

@task
def analyze_by_class(df: pd.DataFrame) -> Dict[int, float]:
    """Analyze survival rates by passenger class
    
    Args:
        df: DataFrame containing the Titanic passenger data
        
    Returns:
        Dict[int, float]: Mapping of passenger class to survival rate percentage
    """
    class_stats = df.groupby('Pclass')['Survived'].mean() * 100
    return class_stats.to_dict()

@flow(name="Titanic Data Analysis")
def analyze_titanic_data() -> Dict[str, Any]:
    """Analyze the Titanic dataset and return all computed statistics
    
    Returns:
        Dict[str, Any]: Dictionary containing all analysis results
    """
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
        
    # Return all results for potential further use
    return {
        "basic_stats": stats,
        "class_stats": class_stats
    }

if __name__ == "__main__":
    analyze_titanic_data()