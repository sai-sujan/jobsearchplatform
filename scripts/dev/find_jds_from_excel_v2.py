
import pandas as pd
import os
import glob
from pathlib import Path
import re

def normalize_for_match(text):
    # Remove special chars, lower case
    if not isinstance(text, str): return ""
    return re.sub(r'[^a-z0-9]', '', text.lower())

def main():
    jd_dir = Path("job_descriptions")
    all_jds = list(jd_dir.glob("*.txt"))
    print(f"Index: Found {len(all_jds)} JD files.")
    
    excel_path = "/Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications/jobs_master.xlsx"
    df = pd.read_excel(excel_path)
    
    batch = df.head(5)
    
    found_map = {}
    
    for idx, row in batch.iterrows():
        company = str(row.get('Company', ''))
        title = str(row.get('Title', ''))
        
        norm_company = normalize_for_match(company)
        norm_title = normalize_for_match(title)
        
        # Try to find match in all_jds
        match = None
        for jd in all_jds:
            jd_name = normalize_for_match(jd.name)
            
            # Check if company AND title are in filename
            # Note: filename usually is {index}_{company}_{title}.txt
            
            # Simple check: company subset AND title subset
            # We must be careful about short names
            
            if norm_company in jd_name and norm_title[:10] in jd_name: 
                match = jd
                break
        
        if match:
            print(f"MATCH: {company} | {title} -> {match.name}")
            print(f"path: {match}")
        else:
            print(f"NO MATCH: {company} | {title}")
            # Try even looser: just company?
            for jd in all_jds:
                if norm_company in normalize_for_match(jd.name):
                    print(f"  Did you mean? {jd.name}")
                    # Don't auto-accept, just list
                    break

if __name__ == "__main__":
    main()
