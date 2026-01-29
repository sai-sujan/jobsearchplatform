import sys
from pathlib import Path
import os
import pandas as pd

# Add source path
sys.path.insert(0, str(Path(os.getcwd()) / 'src'))

try:
    from job_scraper import JobScraper
    print("✅ Successfully imported scraper components")
except ImportError as e:
    print(f"❌ Failed to import scraper: {e}")
    sys.exit(1)

def run_test():
    print("🚀 Starting LIVE Scraper Test...")
    print("Query: 'AI Engineer' | Limit: 1 job (for speed)")
    
    # Initialize settings same as find_jobs.py
    chrome_path = os.getenv("CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    chrome_profile = os.getenv("CHROME_PROFILE_PATH", "")
    blacklist = "config/blacklist.txt"

    scraper = JobScraper(chrome_path, chrome_profile, blacklist, max_jobs=1)
    
    # Run a tiny search
    try:
        jobs = scraper.search_and_collect(
            '("AI Engineer") NOT (Senior)'
        )
        
        print(f"\n📊 Search Result: Found {len(jobs)} jobs")
        
        if len(jobs) > 0:
            job = jobs[0]
            print("\n✅ Verification SUCCESS! Found job:")
            print(f"   - Title: {job.job_title}")
            print(f"   - Company: {job.company_name}")
            print(f"   - Link: {job.job_link}")
            print("\nThe scraper is fetching data correctly from LinkedIn.")
        else:
            print("\n⚠️  No jobs found (this might be due to strict filtering or anti-bot blocks).")
            
    except Exception as e:
        print(f"\n❌ Scraper FAILED with error: {e}")

if __name__ == "__main__":
    run_test()
