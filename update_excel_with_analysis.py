
import pandas as pd
import os
import json
import glob
import re

# Paths
EXCEL_PATH = 'jobs_master.xlsx'
RESULTS_DIR = 'analysis_results'

def update_excel_smart():
    print("----------------------------------------------------------------")
    print("   Syncing Analysis Results to Excel (Smart Match)              ")
    print("----------------------------------------------------------------")

    # Load Excel
    try:
        df = pd.read_excel(EXCEL_PATH, sheet_name='All Jobs')
        print(f"[INFO] Loaded {len(df)} jobs from {EXCEL_PATH}")
    except Exception as e:
        print(f"[ERROR] Could not load Excel file: {e}")
        return

    # Ensure 'Analysis JSON' column exists
    if 'Analysis JSON' not in df.columns:
        df['Analysis JSON'] = ""
        print("[INFO] Created 'Analysis JSON' column")

    # Load all JSON files
    json_files = glob.glob(os.path.join(RESULTS_DIR, "*.json"))
    print(f"[INFO] Found {len(json_files)} analysis files")

    updates_count = 0
    matched_rows = set()

    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            json_content_str = json.dumps(data, indent=2)
            filename = os.path.basename(json_file)
            
            # Extract Company Name from filename
            # Format: {index}_{Company}_{Title}.json
            # Strategy: Split by underscore, take 2nd element? 
            # Or better: The index is part 0. Company starts at part 1.
            # But Company name might have underscores. 
            # We know the logic: {index}_{safe_company}_{safe_title}.json
            
            parts = filename.replace('.json', '').split('_')
            file_index = -1
            
            # Try to get company from filename logic
            # This is heuristic. Better to scan the dataframe for a match.
            
            # Attempt 1: If file has `meta_company`, use it.
            meta_company = data.get('meta_company')
            meta_title = data.get('meta_job_title')
            
            match_index = -1
            
            # Smart Search: Iterate DataFrame to find best match
            for idx, row in df.iterrows():
                if idx in matched_rows:
                    continue
                    
                row_company = str(row.get('Company', ''))
                row_title = str(row.get('Title', ''))
                
                # Normalize for comparison
                clean_row_comp = "".join([c for c in row_company if c.isalnum()]).lower()
                
                # Check filename parts vs row company
                # Filename: 10_Alcimed_... -> "Alcimed" is in it.
                # Filename: 10_Zoox_... -> "Zoox" 
                
                # Extract clean company from filename (remove index)
                # Remove leading digits and underscore
                clean_filename = re.sub(r'^\d+_', '', filename).lower()
                clean_filename = re.sub(r'.json$', '', clean_filename)
                
                if clean_row_comp and clean_row_comp in clean_filename:
                    # Potential match. Check title overlap or index proximity?
                    # Since we have duplicates (ByteDance), simple name match isn't unique.
                    # Use index hint from filename if available
                    if parts[0].isdigit():
                        hint_idx = int(parts[0])
                        # If the hint index is basically the same row (+/- 1 shift), it's likely the one.
                        if abs(idx - hint_idx) <= 5: # Allow small shift
                            match_index = idx
                            break
            
            # If still no match, fallback to exact index if filename has it
            if match_index == -1 and parts[0].isdigit():
                idx_hint = int(parts[0])
                if idx_hint < len(df):
                    # Blindly trust index if Smart Search failed? 
                    # No, that caused the error.
                    # Check if Company name matches vaguely
                    row_val = str(df.at[idx_hint, 'Company'])
                    if row_val[:3].lower() in filename.lower():
                        match_index = idx_hint
            
            if match_index != -1:
                df.at[match_index, 'Analysis JSON'] = json_content_str
                updates_count += 1
                matched_rows.add(match_index)
                print(f"  -> Linked {filename} to Row {match_index} ({df.at[match_index, 'Company']})")
            else:
                print(f"  -> [WARN] Could not match {filename} to any row.")

        except Exception as e:
            print(f"[ERROR] Failed to process {json_file}: {e}")

    # Save
    if updates_count > 0:
        try:
            with pd.ExcelWriter(EXCEL_PATH, engine='openpyxl', mode='a', if_sheet_exists='overlay') as writer:
                 # To safely update, we might need to read all, update, write all.
                 # 'overlay' mode is tricky. Let's just overwrite 'All Jobs' sheet completely.
                 pass
            
            # Simple overwrite approach
            all_sheets = pd.read_excel(EXCEL_PATH, sheet_name=None)
            all_sheets['All Jobs'] = df
            with pd.ExcelWriter(EXCEL_PATH, engine='openpyxl') as writer:
                for s_name, s_df in all_sheets.items():
                    s_df.to_excel(writer, sheet_name=s_name, index=False)
            
            print(f"[SUCCESS] Updated {updates_count} rows in {EXCEL_PATH}")
        except Exception as e:
            print(f"[ERROR] Failed to save Excel: {e}")
    else:
        print("[INFO] No new updates.")

if __name__ == "__main__":
    update_excel_smart()
