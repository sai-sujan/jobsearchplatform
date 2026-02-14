#!/usr/bin/env python3
"""
Main Job Search Script - Daily Search
This script runs comprehensive job searches for the past 24 hours.
Run this manually or schedule it to run every 3 hours.
"""

import sys
import os

# Ensure we can import from src
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from job_scraper import JobScraper
from excel_manager import ExcelManager
from skill_matcher import SkillMatcher
from datetime import datetime

# --- CONFIGURATION ---
CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_PROFILE = os.path.join(os.getcwd(), "chrome_session_v2")
BLACKLIST_FILE = "config/company_blacklist.txt"
MASTER_FILE = "jobs_master.xlsx"

# Search Queries - Customize these for your job search
SEARCH_QUERIES = [
    # 1. AI Engineer
    '("AI Engineer" OR "Artificial Intelligence Engineer") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)',
    
    # 2. Machine Learning Engineer
    '("Machine Learning Engineer" OR "ML Engineer") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)',
    
    # 3. Data Scientist (Top Tier)
    '"Data Scientist" AND ("Machine Learning" OR "Deep Learning" OR "AI" OR "Generative AI") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)',
    
    # 4. Data Engineer (Optional - uncomment if needed)
    # '"Data Engineer" AND ("Python" OR "ETL" OR "Spark") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)',
]

def print_header():
    """Print fancy header."""
    print("\n" + "=" * 80)
    print("  🔍 LINKEDIN JOB SCRAPER - DAILY SEARCH (PAST 24 HOURS)")
    print("=" * 80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Time Range: Past 24 Hours")
    print(f"Target: Up to 40 jobs per query")
    print("=" * 80 + "\n")

def print_summary(total_jobs, total_new, queries_completed):
    """Print final summary."""
    print("\n" + "=" * 80)
    print("  ✅ JOB SEARCH COMPLETE")
    print("=" * 80)
    print(f"  • Queries Completed: {queries_completed}/{len(SEARCH_QUERIES)}")
    print(f"  • Total Jobs Found: {total_jobs}")
    print(f"  • New Jobs Added: {total_new}")
    print(f"  • Master File: {MASTER_FILE}")
    print(f"  • Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80 + "\n")

def main():
    print_header()

    # Initialize scraper with full settings
    scraper = JobScraper(
        chrome_path=CHROME_PATH,
        chrome_profile_path=CHROME_PROFILE,
        blacklist_path=BLACKLIST_FILE,
        action_delay=2.0,
        max_jobs=40  # Full search: 40 jobs per query
    )

    excel_manager = ExcelManager(MASTER_FILE)
    skill_matcher = SkillMatcher()  # Initialize skill matcher for keyword scoring

    total_jobs_found = 0
    total_new_jobs = 0
    queries_completed = 0
    all_collected_links = set()  # Track across all queries to avoid duplicates

    try:
        if not scraper.start_browser():
            print("[ERROR] Failed to start browser. Exiting.")
            return

        # Process each search query
        for query_idx, keywords in enumerate(SEARCH_QUERIES, 1):
            print(f"\n{'='*80}")
            print(f"[QUERY {query_idx}/{len(SEARCH_QUERIES)}] {keywords[:70]}")
            print('='*80)
            
            # Navigate with 24-HOUR filter (r86400 = 24 hours)
            if scraper.navigate_to_linkedin_jobs(keywords, time_filter="r86400"):

                # Collect job listings
                print(f"\n[INFO] Collecting jobs from past 24 hours...")
                jobs = scraper.collect_job_listings(
                    existing_links=all_collected_links,
                    search_query=keywords
                )
                
                if jobs:
                    total_jobs_found += len(jobs)
                    print(f"\n[INFO] Found {len(jobs)} jobs for this query")
                    print(f"[INFO] Fetching descriptions and locations...")
                    
                    # Get full details for each job (description + location)
                    for i, job in enumerate(jobs, 1):
                        print(f"[{i}/{len(jobs)}] ", end="")
                        
                        try:
                            desc = scraper.get_job_description(job)

                            # Add to history only if we got valid description
                            if desc and len(desc) > 50:
                                scraper.history.add(job.job_link)
                                all_collected_links.add(job.job_link)

                                # Calculate keyword matching score
                                score_result = skill_matcher.score_job(
                                    desc,
                                    is_premium=getattr(job, 'is_premium', False),
                                    is_entry_level=(getattr(job, 'role_type', '') == 'Entry-level')
                                )
                                job.skill_score = score_result['final_score']
                                job.matched_skills = score_result.get('matched_skills', [])
                                job.missing_skills = score_result.get('missing_skills', [])
                                job.tier = score_result.get('tier', '')

                            scraper._safe_delay(0.8)
                            
                        except Exception as e:
                            print(f"\n[WARNING] Failed to process job {i}: {e}")
                            continue
                    
                    # Save to Excel
                    print(f"\n[INFO] Saving to Excel...")
                    added = excel_manager.update_master_list(jobs)
                    total_new_jobs += added
                    
                    print(f"[SUCCESS] ✅ Added {added} new jobs from this query")
                    
                else:
                    print(f"[INFO] No jobs found for this query")
                
                queries_completed += 1
                
            else:
                print(f"[ERROR] Failed to navigate for query: {keywords[:50]}")
            
            # Delay between queries to be nice to LinkedIn
            if query_idx < len(SEARCH_QUERIES):
                print(f"\n[INFO] Waiting before next query...")
                scraper._safe_delay(3)

    except KeyboardInterrupt:
        print("\n\n[INFO] ⚠️  Interrupted by user (Ctrl+C)")
        print("[INFO] Saving progress...")
        
    except Exception as e:
        print(f"\n[ERROR] ❌ Search failed: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Always cleanup
        scraper.close_browser()
        scraper.history.save_history()
        print(f"\n[INFO] Browser closed and history saved")

    # Print final summary
    print_summary(total_jobs_found, total_new_jobs, queries_completed)

if __name__ == "__main__":
    main()
