#!/usr/bin/env python3
"""
Re-score Existing Jobs
----------------------
Updates skill scores for all jobs in jobs_master.xlsx
Use this when you update your_skills.txt
"""

import pandas as pd
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'src'))
from skill_matcher import SkillMatcher

MASTER_FILE = "jobs_master.xlsx"

def rescore_all_jobs():
    """Re-score all existing jobs with updated skills"""
    
    if not Path(MASTER_FILE).exists():
        print(f"[ERROR] {MASTER_FILE} not found. Run find_jobs.py first.")
        return
    
    print(f"\n{'='*70}")
    print("  RE-SCORING ALL JOBS WITH UPDATED SKILLS")
    print(f"{'='*70}\n")
    
    # Load existing jobs
    df = pd.read_excel(MASTER_FILE, sheet_name='All Jobs')
    print(f"[INFO] Loaded {len(df)} existing jobs")
    
    # Initialize skill matcher (loads updated skills)
    matcher = SkillMatcher()
    
    # Re-score each job
    print("[INFO] Re-scoring jobs...")
    for index, row in df.iterrows():
        # Skip if no job description
        if pd.isna(row.get('Job Description', '')):
            continue
        
        # Get job details
        job_desc = str(row.get('Job Description', ''))
        is_premium = row.get('Tier', '').startswith('🟢') or row.get('Tier', '').startswith('🟡')
        is_entry = 'entry' in str(row.get('Title', '')).lower() or 'junior' in str(row.get('Title', '')).lower()
        
        # Re-score
        score_result = matcher.score_job(job_desc, is_premium=is_premium, is_entry_level=is_entry)
        
        # Update row
        df.at[index, 'Skill Score'] = score_result['final_score']
        df.at[index, 'Match'] = score_result['match_count']
        df.at[index, 'Tier'] = score_result['tier']
        df.at[index, 'Matched Skills'] = ", ".join(score_result['matched_skills'][:10])
        df.at[index, 'Missing Skills'] = ", ".join(score_result['missing_skills'][:10])
        
        # Update verdict reason if it was YES
        if df.at[index, 'Verdict'] == 'YES':
            df.at[index, 'Reason'] = f"Skill Match: {score_result['final_score']}% ({score_result['match_count']})"
        
        if (index + 1) % 10 == 0:
            print(f"  Processed {index + 1}/{len(df)} jobs...")
    
    print(f"[INFO] Re-scoring complete!")
    
    # Save updated scores
    print(f"[INFO] Saving updated scores to {MASTER_FILE}...")
    
    # Recreate sheets with new scores
    with pd.ExcelWriter(MASTER_FILE, engine='openpyxl') as writer:
        # All Jobs
        df.to_excel(writer, sheet_name='All Jobs', index=False)
        
        # Top Matches (70%+, sorted by score)
        top_matches = df[df['Skill Score'] >= 70].copy()
        top_matches = top_matches.sort_values('Skill Score', ascending=False)
        top_matches.to_excel(writer, sheet_name='Top Matches', index=False)
        
        # Applied
        applied = df[df['Applied'] == 'Applied'].copy()
        applied.to_excel(writer, sheet_name='Applied', index=False)
    
    print(f"\n[SUCCESS] Re-scored {len(df)} jobs!")
    print(f"[INFO] Top Matches: {len(top_matches)} jobs (70%+ score)")
    print(f"\n{'='*70}")
    print("  Open jobs_master.xlsx to see updated scores")
    print(f"{'='*70}\n")

if __name__ == "__main__":
    rescore_all_jobs()
