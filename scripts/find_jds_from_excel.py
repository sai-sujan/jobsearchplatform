
import pandas as pd
import os
import glob
from pathlib import Path

def normalize_text(text):
    return "".join(c for c in str(text) if c.isalnum() or c in ' -_')[:30]

def find_jd_file(company, title):
    # Try to find matching file in job_descriptions/
    # Pattern: ??_Company_Title.txt
    safe_company = normalize_text(company)
    safe_title = normalize_text(title)
    
    # Simple glob
    pattern = f"job_descriptions/*{safe_company}*{safe_title}*.txt"
    files = glob.glob(pattern)
    if files:
        return files[0]
    
    # Try broader search
    pattern = f"job_descriptions/*{safe_company}*.txt"
    files = glob.glob(pattern)
    if files:
        # Check title roughly
        for f in files:
            if safe_title.lower() in f.lower():
                return f
        return files[0]
    
    return None

def main():
    excel_path = "/Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications/jobs_master.xlsx"
    print(f"Reading {excel_path}...")
    df = pd.read_excel(excel_path)
    
    # Take first 5
    batch = df.head(5)
    
    print("\nBatch 1 Jobs:")
    for idx, row in batch.iterrows():
        company = row.get('Company', 'Unknown')
        title = row.get('Title', 'Unknown')
        print(f"{idx+1}. {company} - {title}")
        
        jd_file = find_jd_file(company, title)
        if jd_file:
            print(f"   JD File: {jd_file}")
            print(f"   JD_PATH:{jd_file}") # Marker for parsing
        else:
            print(f"   [WARNING] JD File not found")

if __name__ == "__main__":
    main()
