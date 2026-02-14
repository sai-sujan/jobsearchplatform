import pandas as pd
import json
import os
import sys

# Ensure we can import from src
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src'))

from history_manager import HistoryManager

EXCEL_PATH = 'jobs_master.xlsx'
HISTORY_PATH = 'processed_jobs_history.json'

# Target jobs to remove (Title substring, Company substring)
TARGETS = [
    ("AI Engineer, Design Innovation", "Skechers"),
    ("AI Engineer, United States - BCG X", "BCG X"),
    ("Machine Learning Engineer Graduate", "ByteDance"),
    ("Data Scientist, Tempus Discover", "Tempus AI"),
    ("Data Scientist – Merchandising", "Nordstrom"),
    ("Applied AI Engineer", "Scale AI"),
    ("Machine Learning Engineer", "Skild AI")
]

def clean_recent_run():
    print("--- Cleaning Recent Run ---")
    
    # 1. Load Excel
    try:
        df = pd.read_excel(EXCEL_PATH, sheet_name='All Jobs')
        print(f"Loaded Excel with {len(df)} rows")
    except Exception as e:
        print(f"Error loading Excel: {e}")
        return

    # 2. Find and Remove rows
    links_to_remove = []
    indices_to_drop = []
    
    for idx, row in df.iterrows():
        title = str(row.get('Job_Title', '') or row.get('Title', ''))
        company = str(row.get('Company', ''))
        link = str(row.get('Job_Link', '') or row.get('Link', ''))
        
        for t_sub, c_sub in TARGETS:
            if t_sub in title and c_sub in company:
                print(f"Found match to remove: {title} @ {company}")
                indices_to_drop.append(idx)
                if link:
                    links_to_remove.append(link)
                break
    
    if not indices_to_drop:
        print("No matching jobs found in Excel.")
    else:
        df_clean = df.drop(indices_to_drop)
        print(f"Removing {len(indices_to_drop)} rows. New count: {len(df_clean)}")
        
        # Save back to Excel
        with pd.ExcelWriter(EXCEL_PATH, engine='openpyxl') as writer:
            df_clean.to_excel(writer, sheet_name='All Jobs', index=False)
        print("Saved cleaned Excel.")

    # 3. Remove from History
    if links_to_remove:
        print(f"Removing {len(links_to_remove)} links from history...")
        hm = HistoryManager()
        
        initial_count = len(hm.processed_urls)
        removed_count = 0
        
        for link in links_to_remove:
            # History manager might store normalized URLs, so we try raw and normalized
            # But HM.exists checks exact set.
            # We need to manually access the set and remove
            
            # Simple approach: filter the list
            if link in hm.processed_urls:
                hm.processed_urls.remove(link)
                removed_count += 1
            else:
                # Try partial match or just skip? 
                # Let's try to remove by exact match first
                pass
                
        # Also check if links have query params in history but not in excel etc.
        # HistoryManager usually saves what was passed.
        
        hm.save_history() # Ensure this method writes the set back
        print(f"Removed {removed_count} links from history. (Prev: {initial_count}, New: {len(hm.processed_urls)})")

if __name__ == "__main__":
    clean_recent_run()
