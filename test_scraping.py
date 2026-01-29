
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from src.job_scraper import JobScraper, JobListing
from src.output_writer import OutputWriter
from src.ats_scorer import ScoredJob, EvaluationResult

def main():
    print("Loading configuration...")
    load_dotenv()
    
    # Force settings for this test
    search_keywords = os.getenv('SEARCH_KEYWORDS', 'AI engineer')
    # Handle the OR logic manually here since we are mocking main.py's logic
    if ',' in search_keywords:
        raw_keywords = search_keywords.split(',')
        search_keywords = " OR ".join([f'"{k.strip()}"' for k in raw_keywords if k.strip()])
    
    max_jobs = 10  # Enough to verify filters
    
    print(f"Search Keywords: {search_keywords}")
    print(f"Max Jobs: {max_jobs}")
    
    # Initialize Scraper
    scraper = JobScraper(
        chrome_path=os.getenv('CHROME_PATH'),
        chrome_profile_path=os.getenv('CHROME_PROFILE_PATH'),
        blacklist_path=str(Path(__file__).parent / 'config' / 'company_blacklist.txt'),
        max_jobs=max_jobs,
        action_delay=2.0
    )
    
    # Initialize Writer
    output_path = str(Path(__file__).parent / 'outputs' / 'test_scrape_results.xlsx')
    writer = OutputWriter(output_path)
    
    try:
        # Run Search
        print("\nStarting Scraper...")
        jobs = scraper.search_and_collect(search_keywords)
        
        print(f"\nCollected {len(jobs)} jobs.")
        
        # Create Dummy Evaluations for Output Verification
        scored_jobs = []
        for job in jobs:
            # Create a dummy evaluation result just to test the output format
            eval_result = EvaluationResult(
                ats_score=0, 
                recruiter_verdict="Skipped (Scrape Test Only)",
                score_justification="Scraping verification run.",
                missing_core_skills=["N/A"],
                sponsorship_possible="Unknown"
            )
            
            scored_jobs.append(ScoredJob(
                job=job,
                evaluation=eval_result,
                premium_boost=5
            ))
            
        # Write to Excel
        print(f"Writing to {output_path}...")
        writer.write_excel(scored_jobs)
        
        # Print filters verification
        print("\n--- Filter Verification ---")
        entry_level_count = sum(1 for j in jobs if j.role_type == 'Entry-level')
        intern_count = sum(1 for j in jobs if j.role_type == 'Internship')
        premium_count = sum(1 for j in jobs if j.is_premium)
        
        print(f"Entry-level roles: {entry_level_count}")
        print(f"Internship roles: {intern_count}")
        print(f"Premium jobs: {premium_count}")
        print(f"Total Blacklisted/Skipped: (Check stdout logs)")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        scraper.close_browser()

if __name__ == "__main__":
    main()
