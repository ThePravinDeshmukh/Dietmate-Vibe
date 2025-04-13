from prefect import flow, task
import pandas as pd

@task
def create_sample_data():
    # Create a sample DataFrame
    data = {
        'Name': ['Alice', 'Bob', 'Charlie', 'David'],
        'Age': [25, 30, 35, 28],
        'City': ['New York', 'London', 'Paris', 'Tokyo']
    }
    return pd.DataFrame(data)

@task
def analyze_data(df: pd.DataFrame):
    # Perform some basic analysis
    stats = {
        'average_age': df['Age'].mean(),
        'cities': df['City'].tolist(),
        'total_people': len(df)
    }
    return stats

@flow
def analyze_people_flow():
    # Create the sample data
    df = create_sample_data()
    print("\nSample DataFrame:")
    print(df)
    
    # Analyze the data
    stats = analyze_data(df)
    print("\nAnalysis Results:")
    print(f"Average age: {stats['average_age']:.1f}")
    print(f"Cities: {', '.join(stats['cities'])}")
    print(f"Total people: {stats['total_people']}")

if __name__ == "__main__": 
    analyze_people_flow()