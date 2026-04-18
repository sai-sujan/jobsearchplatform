import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import os
import time
from src.scraper.job_scraper import JobScraper
from src.settings import settings

def login_and_save():
    print("🔐 Starting Login Helper...")
    print("This script will open Chrome. Please log in to LinkedIn immediately.")
    print("The browser will remain open for 5 minutes to ensure your session is saved.")
    
    # Initialize scraper (uses chrome_session_v2)
    chrome_path = settings.CHROME_PATH
    chrome_profile = settings.CHROME_PROFILE_PATH
    blacklist = str(settings.BLACKLIST_FILE)
    
    scraper = JobScraper(chrome_path, chrome_profile, blacklist)
    
    if scraper.start_browser():
        print("\n✅ Browser Launched!")
        print("👉 Go to LinkedIn and Log In now.")
        
        # Navigate to login page
        try:
            scraper.page.goto("https://www.linkedin.com/login", timeout=60000)
        except Exception:
            pass
            
        print("\n⏳ Waiting 5 minutes for you to log in and browse...")
        for i in range(300, 0, -10):
            print(f"Time remaining: {i} seconds...", end='\r')
            time.sleep(10)
            
        print("\n💾 Closing browser to SAVE session...")
        scraper.close_browser()
        print("✅ Session Saved! You can now run the scraper.")
    else:
        print("❌ Failed to launch browser.")

if __name__ == "__main__":
    login_and_save()
