import pandas as pd
import os
import json
import glob
from datetime import datetime

# Paths
BASE_DIR = os.getcwd()
EXCEL_FILE = os.path.join(BASE_DIR, 'jobs_master.xlsx')
ANALYSIS_DIR = os.path.join(BASE_DIR, 'analysis_results')

def rebuild_excel():
    print("Rebuilding Excel from JSON files...")
    
    # Get all JSON files
    json_files = glob.glob(os.path.join(ANALYSIS_DIR, '*.json'))
    print(f"Found {len(json_files)} JSON files.")

    jobs_data = []

    # Try to read old Excel to salvage Links/JDs
    old_data_map = {}
    try:
        # Read without header initially to see raw content? No, standard read.
        old_df = pd.read_excel(EXCEL_FILE, sheet_name='All Jobs')
        print(f"Read {len(old_df)} rows from existing Excel.")
        for _, row in old_df.iterrows():
            # Create a key based on Company+Title
            key = f"{row['Company']}_{row['Title']}"
            old_data_map[key] = {
                'Link': row.get('Link', ''),
                'Job Description': row.get('Job Description', ''),
                'Date Found': row.get('Date Found', '')
            }
    except Exception as e:
        print(f"Could not read old Excel for backup data: {e}")

    # Process all JSONs
    for json_path in json_files:
        filename = os.path.basename(json_path)
        if not filename[0].isdigit():
            continue
            
        try:
            row_idx = int(filename.split('_')[0])
            
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            company = data.get('meta_company', data.get('company_name', filename.split('_')[1]))
            title = data.get('meta_job_title', data.get('title', 'Unknown Title'))
            
            # Try to find backup data
            backup_key = f"{company}_{title}"
            backup = old_data_map.get(backup_key, {})
            
            # Construct row
            job = {
                'New': 'YES', 
                'Company': company,
                'Title': title,
                'Location': data.get('location', ''),
                'Link': data.get('meta_link', backup.get('Link', '')),
                'Date Found': backup.get('Date Found', datetime.now().strftime('%Y-%m-%d %H:%M')),
                'Skill Score': data.get('ats_score', 0),
                'Match': f"{len(data.get('points', []))}/6", # Approximation
                'Tier': 'Unknown',
                'Matched Skills': ', '.join(data.get('tech_stack', {}).get('Programming Languages', [])) if isinstance(data.get('tech_stack'), dict) else '',
                'Missing Skills': '',
                'Verdict': 'YES' if data.get('ats_score', 0) > 50 else 'NO',
                'Reason': f"ATS Score: {data.get('ats_score', 0)}",
                'Applied': 'Not Applied',
                'Search Query': '',
                'Job Description': backup.get('Job Description', ''),
                'Analysis File': json_path,
                'ATS Score': data.get('ats_score', 0)
            }
            
            # Insert at specific index if possible
            while len(jobs_data) <= row_idx:
                jobs_data.append(None)
            jobs_data[row_idx] = job
            
        except Exception as e:
            print(f"Error processing {filename}: {e}")

    # Filter out None values (sparse array filling)
    final_jobs = [j for j in jobs_data if j is not None]
    
    print(f"Reconstructed {len(final_jobs)} jobs.")
    
    # Create DataFrame
    df = pd.DataFrame(final_jobs)
    
    # Save
    with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl', mode='w') as writer:
        df.to_excel(writer, sheet_name='All Jobs', index=False)
        
    print(f"Successfully saved to {EXCEL_FILE}")

if __name__ == "__main__":
    rebuild_excel()
