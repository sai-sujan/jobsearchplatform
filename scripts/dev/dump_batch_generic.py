
import pandas as pd
import sys

def normalize(text):
    return "".join(c for c in str(text) if c.isalnum() or c in ' -_')[:30]

def main():
    if len(sys.argv) < 3:
        print("Usage: python dump_batch_generic.py <start_idx> <end_idx>")
        return

    start_idx = int(sys.argv[1])
    end_idx = int(sys.argv[2])
    
    df = pd.read_excel("/Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications/jobs_master.xlsx")
    
    # Slice
    batch = df.iloc[start_idx:end_idx]
    
    output_file = f"temp_jds_{start_idx}_{end_idx}.txt"
    
    with open(output_file, "w") as f:
        for idx in range(start_idx, min(end_idx, len(df))):
            row = df.iloc[idx]
            company = str(row.get('Company', 'Unknown'))
            title = str(row.get('Title', 'Unknown'))
            jd = str(row.get('Job Description', ''))
            link = str(row.get('Link', '')) # Get Link too
            
            # Calculate safe filename
            safe_company = normalize(company)
            safe_title = normalize(title)
            filename = f"{idx}_{safe_company}_{safe_title}.json"
            
            f.write(f"--- JOB START {idx} ---\n")
            f.write(f"FILENAME: {filename}\n")
            f.write(f"COMPANY: {company}\n")
            f.write(f"TITLE: {title}\n")
            f.write(f"LINK: {link}\n")
            f.write(f"CONTENT:\n{jd}\n")
            f.write("--- JOB END ---\n\n")

    print(f"Dumped rows {start_idx} to {end_idx} in {output_file}")

if __name__ == "__main__":
    main()
