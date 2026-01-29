import pandas as pd
import shutil
import os

MASTER_FILE = "jobs_master.xlsx"
BACKUP_FILE = "jobs_master_dirty_backup.xlsx"

def clean_excel():
    # Backup first
    shutil.copy2(MASTER_FILE, BACKUP_FILE)
    print(f"✅ Backed up to {BACKUP_FILE}")

    # Load
    df = pd.read_excel(MASTER_FILE, sheet_name="All Jobs")
    initial_count = len(df)
    
    # Filter: Job Description length > 50
    # Handle NaNs
    df['Job Description'] = df['Job Description'].fillna('')
    df_clean = df[df['Job Description'].astype(str).apply(len) > 50].copy()
    
    # Reset index
    df_clean = df_clean.reset_index(drop=True)
    
    final_count = len(df_clean)
    removed = initial_count - final_count
    
    print(f"🧹 Removed {removed} rows with empty/short descriptions.")
    print(f"📊 Remaining Valid Jobs: {final_count}")

    # Save cleanly (retaining only 'All Jobs' sheet for simplicity as base)
    # Or preserve other sheets? Often 'All Jobs' is the source of truth.
    # We will write just All Jobs for now to ensure purity.
    
    with pd.ExcelWriter(MASTER_FILE, engine='openpyxl') as writer:
        df_clean.to_excel(writer, sheet_name='All Jobs', index=False)
        
    print(f"✅ Saved cleaned data to {MASTER_FILE}")

if __name__ == "__main__":
    clean_excel()
