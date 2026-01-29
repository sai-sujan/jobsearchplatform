#!/usr/bin/env python3
"""
Job Finder - Past Week Version
Scrapes LinkedIn for jobs posted in the past week, filters jobs, and appends to jobs_master.xlsx
"""

import os
import sys
import pandas as pd
from datetime import datetime
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from job_scraper import JobScraper
from simple_evaluator import SimpleEvaluator
from skill_matcher import SkillMatcher

# Configuration
MASTER_FILE = "jobs_master.xlsx"
SEARCH_QUERIES = [
    ("AI Engineer", '("AI Engineer" OR "Artificial Intelligence Engineer") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)', 20),
    ("Machine Learning Engineer", '("Machine Learning Engineer" OR "ML Engineer") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)', 20),
    ("Data Scientist", '"Data Scientist" AND ("Machine Learning" OR "Deep Learning" OR "AI" OR "Generative AI") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)', 20)
]

# TIME FILTER: Past Week (604800 seconds = 7 days)
TIME_FILTER = "r604800"

def load_existing_master():
    """Load existing master file or create new DataFrame"""
    if os.path.exists(MASTER_FILE):
        try:
            df = pd.read_excel(MASTER_FILE, sheet_name="All Jobs")
            print(f"[INFO] Loaded {len(df)} existing jobs from {MASTER_FILE}")
            return df
        except Exception as e:
            print(f"[WARNING] Could not load existing file: {e}")
            return pd.DataFrame()
    return pd.DataFrame()

def create_master_excel(df):
    """Create Excel with formatting and dropdown"""
    from openpyxl import load_workbook
    from openpyxl.styles import PatternFill, Font, Alignment
    from openpyxl.worksheet.datavalidation import DataValidation

    # Save to Excel
    with pd.ExcelWriter(MASTER_FILE, engine='openpyxl') as writer:
        # Sheet 1: All Jobs (everything)
        df.to_excel(writer, sheet_name='All Jobs', index=False)

        # Sheet 2: Top Matches (70%+ skill score, sorted by score)
        top_matches = df[df['Skill Score'] >= 70].copy()
        top_matches = top_matches.sort_values('Skill Score', ascending=False)
        top_matches.to_excel(writer, sheet_name='Top Matches', index=False)

        # Sheet 3: Applied (only checked applications)
        applied = df[df['Applied'] == 'Applied'].copy()
        applied.to_excel(writer, sheet_name='Applied', index=False)

    # Add formatting
    wb = load_workbook(MASTER_FILE)

    for sheet_name in ['All Jobs', 'Top Matches', 'Applied']:
        ws = wb[sheet_name]

        # Add dropdown to "Applied" column (now column M)
        if ws.max_row > 1:  # Only add dropdown if there are data rows
            dv = DataValidation(type="list", formula1='"Not Applied,Applied"', allow_blank=True)
            ws.add_data_validation(dv)
            dv.add(f'M2:M{ws.max_row}')

        # Color code rows by Tier
        green_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
        yellow_fill = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
        orange_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
        red_fill = PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid")

        for row in range(2, ws.max_row + 1):
            tier_cell = ws.cell(row=row, column=9)  # Tier column (now I)
            tier_value = str(tier_cell.value) if tier_cell.value else ""

            if "green" in tier_value.lower() or "1" in tier_value:
                fill = green_fill
            elif "yellow" in tier_value.lower() or "2" in tier_value:
                fill = yellow_fill
            elif "orange" in tier_value.lower() or "3" in tier_value:
                fill = orange_fill
            else:
                fill = red_fill

            for col in range(1, ws.max_column + 1):
                ws.cell(row=row, column=col).fill = fill

        # Set column widths
        ws.column_dimensions['A'].width = 6   # New
        ws.column_dimensions['B'].width = 20  # Company
        ws.column_dimensions['C'].width = 35  # Title
        ws.column_dimensions['D'].width = 15  # Location
        ws.column_dimensions['E'].width = 50  # Link
        ws.column_dimensions['F'].width = 15  # Date Found
        ws.column_dimensions['G'].width = 12  # Skill Score
        ws.column_dimensions['H'].width = 10  # Match
        ws.column_dimensions['I'].width = 18  # Tier
        ws.column_dimensions['J'].width = 40  # Matched Skills
        ws.column_dimensions['K'].width = 40  # Missing Skills
        ws.column_dimensions['L'].width = 10  # Verdict
        ws.column_dimensions['M'].width = 15  # Applied
        ws.column_dimensions['N'].width = 20  # Search Query
        ws.column_dimensions['O'].width = 60  # Job Description

    wb.save(MASTER_FILE)
    print(f"[SUCCESS] Master file updated: {MASTER_FILE}")

def main():
    print("\n" + "="*70)
    print("  JOB FINDER - PAST WEEK Search")
    print("="*70 + "\n")

    # Load existing jobs
    existing_df = load_existing_master()
    existing_urls = set(existing_df['Link'].tolist()) if not existing_df.empty else set()

    # Initialize components
    chrome_path = os.getenv("CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    chrome_profile = os.getenv("CHROME_PROFILE_PATH", "")
    blacklist_path = "config/blacklist.txt"

    simple_eval = SimpleEvaluator()
    skill_matcher = SkillMatcher()

    all_new_jobs = []

    # Run searches
    for role_name, keywords, count in SEARCH_QUERIES:
        print(f"\n[SEARCH] {role_name} (Target: {count} jobs)")
        print("-" * 70)

        # Create new scraper for each search
        scraper = JobScraper(chrome_path, chrome_profile, blacklist_path, max_jobs=count)

        if not scraper.start_browser():
            print(f"[ERROR] Failed to start browser for {role_name}")
            continue

        # Navigate with PAST WEEK filter
        print(f"[INFO] --- Searching Past Week (r604800) ---")
        if scraper.navigate_to_linkedin_jobs(keywords, time_filter=TIME_FILTER):
            jobs = scraper.collect_job_listings(search_query=keywords)

            if jobs:
                # Get descriptions
                print(f"\n[INFO] Fetching job descriptions for {len(jobs)} jobs...")
                for i, job in enumerate(jobs, 1):
                    print(f"[{i}/{len(jobs)}] ", end="")
                    scraper.get_job_description(job)
                    scraper._safe_delay(1)
        else:
            jobs = []

        scraper.close_browser()

        if not jobs:
            print(f"[INFO] No jobs found for {role_name}")
            continue

        # Filter and evaluate
        for job in jobs:
            # Skip if already in master file
            if job.job_link in existing_urls:
                continue

            # Simple filter (Senior/Citizenship)
            passed, reason = simple_eval.quick_check(job.job_title, job.job_description)

            if not passed:
                verdict = "NO"
                verdict_reason = f"Rejected: {reason}"
                skill_score = 0
                match_count = "0/0"
                matched_skills = ""
                missing_skills = ""
                tier = "Filtered Out"
            else:
                # Passed filter - now score based on skills
                score_result = skill_matcher.score_job(
                    job.job_description,
                    is_premium=job.is_premium,
                    is_entry_level=(job.role_type == "Entry-level")
                )

                skill_score = score_result['final_score']
                match_count = score_result['match_count']
                matched_skills = ", ".join(score_result['matched_skills'][:10])
                missing_skills = ", ".join(score_result['missing_skills'][:10])
                tier = score_result['tier']

                verdict = "YES"
                verdict_reason = f"Skill Match: {skill_score}% ({match_count})"

            all_new_jobs.append({
                'New': 'NEW',
                'Company': job.company_name,
                'Title': job.job_title,
                'Location': job.location,
                'Link': job.job_link,
                'Date Found': datetime.now().strftime("%Y-%m-%d %H:%M"),
                'Skill Score': skill_score,
                'Match': match_count,
                'Tier': tier,
                'Matched Skills': matched_skills,
                'Missing Skills': missing_skills,
                'Verdict': verdict,
                'Reason': verdict_reason,
                'Applied': 'Not Applied',
                'Search Query': job.search_query,
                'Job Description': job.job_description[:2000] if job.job_description else ''
            })

    # Merge with existing
    if all_new_jobs:
        new_df = pd.DataFrame(all_new_jobs)

        if not existing_df.empty:
            if 'New' in existing_df.columns:
                existing_df['New'] = ''
            else:
                existing_df['New'] = ''

            combined_df = pd.concat([existing_df, new_df], ignore_index=True)
        else:
            combined_df = new_df

        create_master_excel(combined_df)

        total_new = len(all_new_jobs)
        passed_filter = len([j for j in all_new_jobs if j['Verdict'] == 'YES'])
        good_matches = len([j for j in all_new_jobs if j['Skill Score'] >= 70])
        perfect_matches = len([j for j in all_new_jobs if j['Skill Score'] >= 90])

        print(f"\n[SUCCESS] Added {total_new} new jobs to {MASTER_FILE}")
        print(f"[INFO] Total jobs in master: {len(combined_df)}")
        print(f"\nSTATISTICS:")
        print(f"  - Total fetched: {total_new}")
        print(f"  - Passed filters (YES): {passed_filter} ({int(passed_filter/total_new*100) if total_new > 0 else 0}%)")
        print(f"  - Good matches (70%+): {good_matches} ({int(good_matches/total_new*100) if total_new > 0 else 0}%)")
        print(f"  - Perfect matches (90%+): {perfect_matches} ({int(perfect_matches/total_new*100) if total_new > 0 else 0}%)")
    else:
        print("\n[INFO] No new jobs found (all were duplicates)")

    print("\n" + "="*70)
    print("  COMPLETE - Open jobs_master.xlsx to review")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()
