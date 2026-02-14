
import pandas as pd
import os

file_path = 'jobs_master.xlsx'
if not os.path.exists(file_path):
    print("jobs_master.xlsx not found")
else:
    df = pd.read_excel(file_path)
    print("Columns:", df.columns.tolist())
    
    if 'Status' in df.columns:
        print("\nUnique values in 'Status':")
        print(df['Status'].unique())
        print("\nSample 'Status' values (first 10):")
        print(df['Status'].head(10).tolist())
    else:
        print("\n'Status' column NOT found")

    if 'Applied' in df.columns:
        print("\nUnique values in 'Applied':")
        print(df['Applied'].unique())
        print("\nSample 'Applied' values (first 10):")
        print(df['Applied'].head(10).tolist())
    else:
        print("\n'Applied' column NOT found")
