import pandas as pd
import os
import json
import re

# Config
EXCEL_PATH = "jobs_master.xlsx"
JSON_DIR = "analysis_results"

def main():
    if not os.path.exists(EXCEL_PATH):
        print(f"Error: {EXCEL_PATH} not found.")
        return

    df = pd.read_excel(EXCEL_PATH)
    
    # Ensure columns exist
    if "Analysis File" not in df.columns:
        df["Analysis File"] = ""
    if "ATS Score" not in df.columns:
        df["ATS Score"] = ""

    # Get all JSON files
    json_files = [f for f in os.listdir(JSON_DIR) if f.endswith('.json')]
    
    print(f"Found {len(json_files)} JSON files in {JSON_DIR}...")

    updated_count = 0

    # Iterate through rows
    for index, row in df.iterrows():
        # Look for a JSON file that starts with "{index}_"
        prefix = f"{index}_"
        matching_files = [f for f in json_files if f.startswith(prefix)]
        
        if matching_files:
            # Take the first match (should be unique)
            json_filename = matching_files[0]
            json_path = os.path.join(JSON_DIR, json_filename)
            abs_path = os.path.abspath(json_path)
            
            # Read JSON to get ATS Score
            try:
                with open(json_path, 'r') as f:
                    data = json.load(f)
                    ats_score = data.get("ats_score", "N/A")
            except Exception as e:
                print(f"Error reading {json_filename}: {e}")
                ats_score = "Error"

            # Update DataFrame
            # strict matching by index ensures allowed overwrites
            df.at[index, "Analysis File"] = abs_path
            df.at[index, "ATS Score"] = ats_score
            
            updated_count += 1
            # print(f"Row {index}: Linked {json_filename} (Score: {ats_score})")
        else:
            # print(f"Row {index}: No matching JSON found.")
            pass

    # Save
    df.to_excel(EXCEL_PATH, index=False)
    print(f"Successfully updated {updated_count} rows in {EXCEL_PATH}.")

if __name__ == "__main__":
    main()
