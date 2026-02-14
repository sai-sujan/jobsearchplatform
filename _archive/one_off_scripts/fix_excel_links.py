import pandas as pd
import os
import json
import glob
from pathlib import Path

# Paths
BASE_DIR = os.getcwd()
EXCEL_FILE = os.path.join(BASE_DIR, 'jobs_master.xlsx')
ANALYSIS_DIR = os.path.join(BASE_DIR, 'analysis_results')

def fix_links():
    print(f"Reading {EXCEL_FILE}...")
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name='All Jobs')
    except ValueError:
        # Fallback if sheet name is different
        df = pd.read_excel(EXCEL_FILE)
        print("Warning: 'All Jobs' sheet not found, used default.")

    # Ensure columns exist
    if 'Analysis File' not in df.columns:
        df['Analysis File'] = ''
    if 'ATS Score' not in df.columns:
        df['ATS Score'] = 0

    # Get all JSON files
    json_files = glob.glob(os.path.join(ANALYSIS_DIR, '*.json'))
    print(f"Found {len(json_files)} JSON files.")

    updates = 0
    for json_path in json_files:
        filename = os.path.basename(json_path)
        # Format: {index}_{company}_{title}.json
        try:
            row_idx = int(filename.split('_')[0])
            
            if row_idx < len(df):
                # Update path
                df.at[row_idx, 'Analysis File'] = json_path
                
                # Update Score
                try:
                    with open(json_path, 'r') as f:
                        data = json.load(f)
                        if 'ats_score' in data:
                            df.at[row_idx, 'ATS Score'] = data['ats_score']
                except Exception as e:
                    print(f"Error reading {filename}: {e}")
                
                updates += 1
            else:
                print(f"Skipping {filename}: Index {row_idx} out of bounds (Size: {len(df)})")
                
        except ValueError:
            print(f"Skipping {filename}: Could not parse index")

    print(f"Updated {updates} rows.")
    
    # Save back
    with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl', mode='w') as writer:
        df.to_excel(writer, sheet_name='All Jobs', index=False)
    
    print("Saved jobs_master.xlsx")

if __name__ == "__main__":
    fix_links()
