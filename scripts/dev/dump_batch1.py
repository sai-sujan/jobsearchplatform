
import pandas as pd
import re

def normalize(text):
    return "".join(c for c in str(text) if c.isalnum() or c in ' -_')[:30]

df = pd.read_excel("/Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications/jobs_master.xlsx")
batch = df.iloc[0:5]

with open("temp_jds_batch1.txt", "w") as f:
    for idx, row in batch.iterrows():
        company = str(row.get('Company', 'Unknown'))
        title = str(row.get('Title', 'Unknown'))
        jd = str(row.get('Job Description', ''))
        
        # Calculate safe filename
        safe_company = normalize(company)
        safe_title = normalize(title)
        filename = f"{idx+1}_{safe_company}_{safe_title}.json"
        
        f.write(f"--- JOB START {idx+1} ---\n")
        f.write(f"FILENAME: {filename}\n")
        f.write(f"COMPANY: {company}\n")
        f.write(f"TITLE: {title}\n")
        f.write(f"CONTENT:\n{jd}\n")
        f.write("--- JOB END ---\n\n")

print("Dumped to temp_jds_batch1.txt")
