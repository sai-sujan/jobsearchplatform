#!/usr/bin/env python3
"""
Re-score Existing Jobs
----------------------
Updates skill scores for all jobs in jobs_master.xlsx
Use this when you update your_skills.txt
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from src.evaluation.skill_matcher import SkillMatcher
from src.settings import settings
from src.utils import load_excel_safe

MASTER_FILE = str(settings.MASTER_EXCEL)

def rescore_all_jobs():
    """Re-score all existing jobs with updated skills"""
    
    if not Path(MASTER_FILE).exists():
        print(f"[ERROR] {MASTER_FILE} not found. Run find_jobs.py first.")
        return
    
    print(f"\n{'='*70}")
    print("  RE-SCORING ALL JOBS WITH UPDATED SKILLS")
    print(f"{'='*70}\n")
    
    # Load existing jobs (try sheet name first, fallback to first sheet)
    df = load_excel_safe(MASTER_FILE, settings.SHEET_NAME)
    print(f"[INFO] Loaded {len(df)} existing jobs")

    # Initialize skill matcher (loads updated skills)
    matcher = SkillMatcher()

    # Re-score each job
    print("[INFO] Re-scoring jobs...")
    rescored = 0
    for index, row in df.iterrows():
        # Skip if no job description (check both column name formats)
        job_desc = row.get('Job_Description', row.get('Job Description', ''))
        if pd.isna(job_desc) or not job_desc:
            continue

        job_desc = str(job_desc)
        job_title = str(row.get('Job_Title', row.get('Title', '')))
        tier = str(row.get('Tier', ''))
        is_premium = tier.startswith('🟢') or tier.startswith('🟡')
        is_entry = 'entry' in job_title.lower() or 'junior' in job_title.lower()

        # Re-score
        score_result = matcher.score_job(job_desc, is_premium=is_premium, is_entry_level=is_entry)

        # Update row (use correct column names)
        df.at[index, 'Keywords_Matching_Score'] = score_result['final_score']
        df.at[index, 'Match'] = score_result['match_count']
        df.at[index, 'Tier'] = score_result['tier']
        df.at[index, 'Matched Skills'] = ", ".join(score_result['matched_skills'][:10])
        df.at[index, 'Missing Skills'] = ", ".join(score_result['missing_skills'][:10])
        rescored += 1

        if (index + 1) % 10 == 0:
            print(f"  Processed {index + 1}/{len(df)} jobs...")
    
    print(f"[INFO] Re-scoring complete! Rescored {rescored} jobs.")

    # Save updated scores
    print(f"[INFO] Saving updated scores to {MASTER_FILE}...")

    # Save to Excel (single sheet to preserve structure)
    df.to_excel(MASTER_FILE, index=False, engine='openpyxl')

    # Count stats
    top_matches = len(df[df['Keywords_Matching_Score'] >= 70])

    print(f"\n[SUCCESS] Re-scored {rescored} jobs!")
    print(f"[INFO] Top Matches: {top_matches} jobs (70%+ score)")
    print(f"\n{'='*70}")
    print("  Open jobs_master.xlsx to see updated scores")
    print(f"{'='*70}\n")

if __name__ == "__main__":
    rescore_all_jobs()
