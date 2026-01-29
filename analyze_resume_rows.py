
import pandas as pd
import os
import json
import time
from src.resume_evaluator import ResumeEvaluator

# Directories
RESULTS_DIR = "analysis_results"
if not os.path.exists(RESULTS_DIR):
    os.makedirs(RESULTS_DIR)

RESUME_PATH = "/Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications/resume/master_resume.txt"
EXCEL_PATH = "jobs_master.xlsx"

# User's Final Prompt (Step 3668)
USER_PROMPT_TEMPLATE = """
You are a Senior AI/ML Recruiter and ATS Specialist. I will provide a candidate’s resume and a job description (JD). Your task is to analyze the resume against the JD and produce a single JSON output **only**, with the following specifications:

1. "ats_score": Estimated ATS match score (0–100) based on resume vs JD alignment.
2. "location": Use the location mentioned in the resume. If no location is found, use "Springfield, MO, USA (Open to relocate)".
3. "tech_stack": Include **only major JD-relevant technologies** that should appear in the resume. Organize logically: Programming Languages, ML Frameworks & Libraries, LLM & NLP Tools, Cloud & Deployment, Databases & Data Engineering, Web & DevOps, ML Concepts & Specializations. Only add a new technology if it is **truly missing** from the resume but required by the JD. Keep it concise and ATS-friendly; do not overdo or add optional tools.
4. "points": Include **up to 6 bullets from the candidate’s first experience section only**. Do **not add new bullets**. For each bullet, you may **slightly enhance wording** to:
   - Highlight technical achievements or measurable impact.
   - Incorporate relevant JD keywords (Python, ML frameworks, LLMs, deployment, data pipelines, etc.) if missing.
   - Keep bullets concise, clear, and recruiter-friendly.
   Use **LaTeX-style \\item** formatting for all bullets.
5. **Output rules**: Only output JSON, no explanations or extra text. Ensure all enhancements are **truthful, realistic, and aligned with 0–2 year experience candidates**.

**JSON example format**:

{{
  "ats_score": 88,
  "location": "Springfield, MO, USA (Open to relocate)",
  "tech_stack": {{
    "Programming Languages": [...],
    "ML Frameworks & Libraries": [...],
    "LLM & NLP Tools": [...],
    "Cloud & Deployment": [...],
    "Databases & Data Engineering": [...],
    "Web & DevOps": [...],
    "ML Concepts & Specializations": [...]
  }},
  "points": [
    "\\item Bullet 1",
    "\\item Bullet 2",
    "\\item Bullet 3",
    "\\item Bullet 4",
    "\\item Bullet 5",
    "\\item Bullet 6"
  ]
}}

**Resume**: 
{resume_text}

**Job Description**: 
{job_description}
"""

def analyze_new_jobs():
    print("----------------------------------------------------------------")
    print("   Starting Incremental Analysis (Excel Check)                  ")
    print("----------------------------------------------------------------")

    # 1. Load Resume
    try:
        with open(RESUME_PATH, 'r', encoding='utf-8') as f:
            resume_text = f.read()
        print(f"[INFO] Resume loaded: {len(resume_text)} chars")
    except Exception as e:
        print(f"[ERROR] Could not load resume at {RESUME_PATH}: {e}")
        return

    # 2. Load Excel
    try:
        df = pd.read_excel(EXCEL_PATH, sheet_name='All Jobs')
        print(f"[INFO] Loaded {len(df)} jobs from {EXCEL_PATH}")
    except Exception as e:
        print(f"[ERROR] Could not load Excel file: {e}")
        return

    # Check if 'Analysis JSON' column exists
    if 'Analysis JSON' not in df.columns:
        print("[INFO] 'Analysis JSON' column missing. Treating all as new (subject to filename check).")
        df['Analysis JSON'] = "" # logic will rely on empty entries

    # Initialize Evaluator
    evaluator = ResumeEvaluator()

    # Counter for batch limit
    processed_count = 0
    BATCH_LIMIT = 5

    # Iterate rows
    for index, row in df.iterrows():
        if processed_count >= BATCH_LIMIT:
            print(f"[INFO] Reached batch limit of {BATCH_LIMIT}. Stopping.")
            break

        # Check existing analysis in Excel
        analysis_in_excel = str(row.get('Analysis JSON', ''))
        if analysis_in_excel and analysis_in_excel.lower() != 'nan' and len(analysis_in_excel.strip()) > 10:
            # Already done in Excel
            # print(f"[{index}] Skipped (Filled in Excel)")
            continue

        job_title = str(row.get('Title', 'Unknown')).split('\\n')[0]
        company = str(row.get('Company', 'Unknown'))
        description = str(row.get('Job Description', ''))
        job_link = str(row.get('Link', f'job_{index}'))

        # Also check file existence to be double sure we don't re-run if script failed mid-way before update
        safe_company = "".join([c for c in company if c.isalnum() or c in (' ', '_')]).strip().replace(' ', '_')
        safe_title = "".join([c for c in job_title if c.isalnum() or c in (' ', '_')]).strip().replace(' ', '_')
        filename = f"{index}_{safe_company}_{safe_title}.json"
        result_file = os.path.join(RESULTS_DIR, filename)

        if os.path.exists(result_file):
            print(f"[{index+1}/{len(df)}] Skipped (File Exists): {job_title}")
            continue

        if not description or len(description) < 50 or description.lower() == 'nan':
            # print(f"[{index+1}/{len(df)}] Skipped (No Description)")
            continue

        # Found a NEW job
        print(f"[{index+1}/{len(df)}] Processing NEW: {job_title} at {company}")

        full_prompt = USER_PROMPT_TEMPLATE.format(
            resume_text=resume_text,
            job_description=description
        )

        try:
            response_text = evaluator._generate(full_prompt)
            json_data = evaluator._extract_json(response_text)
            
            if json_data:
                # Add metadata
                json_data['meta_job_title'] = job_title
                json_data['meta_company'] = company
                json_data['meta_link'] = job_link

                with open(result_file, 'w', encoding='utf-8') as f:
                    json.dump(json_data, f, indent=2)
                
                print(f"  -> Saved to {result_file}")
                processed_count += 1
            else:
                print(f"  -> [WARNING] Empty JSON response")

        except Exception as e:
            print(f"  -> Generation failed: {e}")
            
    if processed_count == 0:
        print("[INFO] No new jobs found to process (or all descriptions missing).")

if __name__ == "__main__":
    analyze_new_jobs()
