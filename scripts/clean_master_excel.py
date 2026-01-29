import pandas as pd
import os
import shutil
from datetime import datetime

EXCEL_PATH = 'jobs_master.xlsx'

STANDARD_COLUMNS = [
    'Status',
    'Company',
    'Job_Title',
    'Location',
    'Job_Link',
    'Posting_Date',
    'Date_Added',
    'Keywords_Matching_Score',
    'Analysis_File',
    'Analysis_JSON',
    'Job_Description',
    'Search_Query',
    'Role_Type',
    'Is_Premium',
    'Premium_Indicators'
]

def clean_master_excel():
    print("----------------------------------------------------------------")
    print("   Standardizing Excel Schema & Cleaning Data                   ")
    print("----------------------------------------------------------------")

    if not os.path.exists(EXCEL_PATH):
        print(f"[ERROR] {EXCEL_PATH} not found.")
        return

    # 1. Backup
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = f"{EXCEL_PATH.replace('.xlsx', '')}_backup_{timestamp}.xlsx"
    shutil.copy2(EXCEL_PATH, backup_path)
    print(f"[INFO] Created backup: {backup_path}")

    # 2. Load Data
    try:
        df = pd.read_excel(EXCEL_PATH)
        print(f"[INFO] Loaded {len(df)} rows. Current columns: {df.columns.tolist()}")
    except Exception as e:
        print(f"[ERROR] Failed to read Excel: {e}")
        return

    # 3. Rename / Merge Columns
    # Map old -> new
    mappings = {
        'Title': 'Job_Title',
        'Link': 'Job_Link',
        'Date Found': 'Date_Added',
        'Skill Score': 'Keywords_Matching_Score',
        'Analysis File': 'Analysis_File',
        'Analysis JSON': 'Analysis_JSON',
        'Search Query': 'Search_Query',
        'Job Description': 'Job_Description',
        'Role Type': 'Role_Type',
        'Posting Date': 'Posting_Date',
        'Company Name': 'Company'
    }
    
    # Apply renames
    df = df.rename(columns=mappings)
    
    # Check for duplicate column names
    if len(df.columns) != len(set(df.columns)):
        print("[INFO] Duplicate columns detected after rename. Merging...")
        # Get unique column names
        unique_cols = set(df.columns)
        
        # Create a new dict for data
        merged_data = {}
        
        for col_name in unique_cols:
            # If multiple columns with same name exist
            if list(df.columns).count(col_name) > 1:
                # Get all instances of this column
                # Since we can't easily select by name when duplicates exist (it returns df),
                # we iterate by integer index.
                col_indices = [i for i, c in enumerate(df.columns) if c == col_name]
                
                # Start with the first one
                combined_series = df.iloc[:, col_indices[0]].copy()
                
                # Coalesce with others
                for idx in col_indices[1:]:
                    combined_series = combined_series.combine_first(df.iloc[:, idx])
                    
                merged_data[col_name] = combined_series
            else:
                merged_data[col_name] = df[col_name]
        
        # Reconstruct DataFrame
        df = pd.DataFrame(merged_data)
        print(f"[INFO] Merged duplicates. New count: {len(df.columns)}")

    # 4. Fill Defaults
    if 'Status' not in df.columns:
        df['Status'] = 'New'
    else:
        df['Status'] = df['Status'].fillna('New')
        
    # 5. Select & Reorder
    # Create missing columns
    for col in STANDARD_COLUMNS:
        if col not in df.columns:
            df[col] = None
            
    # Filter to standard columns
    final_df = df[STANDARD_COLUMNS]
    
    # Final check for duplicates in the goal list (shouldn't happen)
    if final_df.columns.duplicated().any():
        print("[ERROR] Still have duplicates in final selection")
        final_df = final_df.loc[:, ~final_df.columns.duplicated()]
    
    # 6. Save
    try:
        final_df.to_excel(EXCEL_PATH, index=False, engine='openpyxl')
        print(f"[SUCCESS] Saved standardized file with {len(final_df)} rows.")
        print(f"[INFO] Schema: {final_df.columns.tolist()}")
    except Exception as e:
        print(f"[ERROR] Failed to save: {e}")

if __name__ == "__main__":
    clean_master_excel()
