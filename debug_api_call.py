import pandas as pd
import json
import requests

excel_file = 'jobs_master.xlsx'
try:
    response = requests.get("http://localhost:8000/api/jobs")
    data = response.json()
    print(f"API Returned {len(data['jobs'])} jobs.")
    # breakdowns
    print(f"Stats: {data['stats']}")

    xl = pd.ExcelFile(excel_file)
    print(f"Sheet Names: {xl.sheet_names}")
    
    for sheet in xl.sheet_names:
        print(f"\n--- Sheet: {sheet} ---")
        df = pd.read_excel(excel_file, sheet_name=sheet)
        print(f"Columns: {df.columns.tolist()}")
        if not df.empty:
            first_row = df.iloc[0]
            for col in df.columns:
                val = first_row[col]
                print(f"  {col}: {str(val)[:100]} {'...' if len(str(val))>100 else ''}")
                
except Exception as e:
    print(f"Error reading Excel: {e}")
