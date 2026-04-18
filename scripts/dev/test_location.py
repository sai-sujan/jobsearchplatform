
import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'src'))
from job_scraper import JobScraper, JobListing
from playwright.sync_api import sync_playwright

def test_location_extraction(url):
    print(f"Testing location extraction for: {url}")
    
    with sync_playwright() as p:
        # Launch browser (headless=True for speed, but False to debug if needed)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
             user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        # Mocking the scraper to use its method
        scraper = JobScraper(chrome_path="", chrome_profile_path="", blacklist_path="")
        scraper.history = type('obj', (object,), {'exists': lambda x: False, 'add': lambda x: None}) # Mock history
        scraper.page = page
        
        try:
            print("Navigating...")
            page.goto(url, wait_until='domcontentloaded')
            page.wait_for_timeout(3000) # Wait for render
            
            print("Extracting location...")
            location = scraper._extract_location_from_detail_page()
            
            print(f"\n[RESULT] Extracted Location: '{location}'")
            
            # Also text description fallback check
            if not location:
                print("Primary extraction failed. Checking description text fallback...")
                desc_elem = page.query_selector('.jobs-box__html-content')
                if desc_elem:
                   desc_text = desc_elem.inner_text()
                   # (Replicating the logic from get_job_description roughly)
                   if ' · ' in desc_text:
                       # simplified check
                       print(f"Fallback found candidate line: {desc_text.splitlines()[0]}")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        url = sys.argv[1]
        test_location_extraction(url)
    else:
        print("Usage: python3 scripts/test_location.py <url>")
