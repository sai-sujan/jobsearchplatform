#!/usr/bin/env python3
"""
Launcher for 24-Hour Job Search Updates
This script runs the scraper specifically for jobs posted in the LAST 24 HOURS.
It is designed to be run frequently (e.g., every 3 hours) by a LaunchAgent.
"""

import sys
import os

# Ensure we can import from src
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from job_scraper import JobScraper
from excel_manager import ExcelManager
from datetime import datetime

# --- CONFIGURATION ---
CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_PROFILE = os.path.join(os.getcwd(), "chrome_session_v2")
BLACKLIST_FILE = "config/company_blacklist.txt"
MASTER_FILE = "jobs_master.xlsx"

# Search Filters (Same as main script)
SEARCH_QUERIES = [
    # 1. AI Engineer
    '("AI Engineer" OR "Artificial Intelligence Engineer") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)',
    
    # 2. Machine Learning Engineer
    '("Machine Learning Engineer" OR "ML Engineer") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)',
    
    # 3. Data Scientist (Top Tier)
    '"Data Scientist" AND ("Machine Learning" OR "Deep Learning" OR "AI" OR "Generative AI") NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)'
]

def main():
    print(f"\n==========================================")
    print(f"24h UPDATE Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"==========================================\n")

    scraper = JobScraper(CHROME_PATH, CHROME_PROFILE, BLACKLIST_FILE)
    excel_manager = ExcelManager(MASTER_FILE)

    total_new_jobs = 0

    try:
        if not scraper.start_browser():
            return

        for keywords in SEARCH_QUERIES:
            # FORCE TIME FILTER = r86400 (Past 24 Hours)
            print(f"\n[SEARCH 24h] {keywords[:30]}...")
            
            # Manually calling internal methods to enforce 24h filter
            # (Note: job_scraper.py usually defaults to r604800, so we pass explicit arg)
            if scraper.navigate_to_linkedin_jobs(keywords, time_filter="r86400"):
                new_jobs = scraper.collect_job_listings(search_query=keywords)
                
                # Filter & Save immediately
                if new_jobs:
                    print(f"[INFO] Found {len(new_jobs)} recent jobs. Getting descriptions...")
                    for job in new_jobs:
                        scraper.get_description(job)
                        scraper.history.add(job.job_link)
                    
                    added = excel_manager.update_master_list(new_jobs)
                    total_new_jobs += added
                else:
                    print("[INFO] No new jobs in last 24h.")

            scraper._safe_delay(2)

    except Exception as e:
        print(f"[ERROR] 24h Update Failed: {e}")
    finally:
        scraper.close_browser()
        scraper.history.save_history()

    print(f"\n[DONE] 24h Update Complete. Added {total_new_jobs} new jobs.\n")

if __name__ == "__main__":
    main()
