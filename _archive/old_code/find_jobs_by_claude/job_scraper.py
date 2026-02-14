"""
JobScraper Module - Layout Agnostic & Robust
--------------------------------------------
Rebuilt to handle various LinkedIn layouts (Sidebar vs List), Promoted jobs, and Equal Opportunity prioritization.
"""

import os
import time
import random
import json
from urllib.parse import quote_plus
from typing import List, Optional
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page, BrowserContext

@dataclass
class JobListing:
    """Data class for a single job listing."""
    company_name: str
    job_title: str
    job_link: str
    posting_date: str
    role_type: str
    job_description: str = ""
    location: str = ""
    sponsorship_text: str = ""
    is_premium: bool = False
    premium_indicators: str = ""
    search_query: str = ""

class JobScraper:
    def __init__(self, chrome_path: str, chrome_profile_path: str, blacklist_path: str, action_delay: float = 2.0, max_jobs: int = 40):
        self.chrome_path = chrome_path
        self.chrome_profile_path = chrome_profile_path
        self.action_delay = action_delay
        self.max_jobs = max_jobs
        self.blacklist_keywords = self._load_blacklist(blacklist_path)
        
        from history_manager import HistoryManager
        self.history = HistoryManager()
        
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None

    def _load_blacklist(self, blacklist_path: str) -> List[str]:
        if os.path.exists(blacklist_path):
            with open(blacklist_path, 'r') as f:
                return [line.strip().lower() for line in f if line.strip() and not line.startswith('#')]
        return []

    def _safe_delay(self, multiplier: float = 1.0):
        time.sleep(self.action_delay * multiplier * (0.8 + random.random() * 0.4))

    def start_browser(self) -> bool:
        try:
            print("[INFO] Starting Chrome browser...")
            self.playwright = sync_playwright().start()
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            session_dir = os.path.join(base_dir, 'chrome_session_v2')
            os.makedirs(session_dir, exist_ok=True)
            
            # Auto-heal lock
            lock_file = os.path.join(session_dir, 'SingletonLock')
            if os.path.exists(lock_file):
                try: os.remove(lock_file)
                except: pass

            self.context = self.playwright.chromium.launch_persistent_context(
                user_data_dir=session_dir,
                channel='chrome',
                headless=False,
                slow_mo=50,
                args=['--disable-blink-features=AutomationControlled']
            )
            self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
            return True
        except Exception as e:
            print(f"[ERROR] Browser start failed: {e}")
            return False

    def close_browser(self):
        try:
            if self.context: self.context.close()
            if self.playwright: self.playwright.stop()
        except: pass

    def build_linkedin_url(self, keywords: str, time_filter: str) -> str:
        return f"https://www.linkedin.com/jobs/search/?keywords={quote_plus(keywords)}&f_E=1%2C2&f_TPR={time_filter}&sortBy=R"

    def _smart_scroll(self):
        """Detect scrollable container and scroll it."""
        try:
            # Inject JS to find the element causing scroll
            scroll_script = """
                () => {
                    // Try standard sidebar first
                    const sidebar = document.querySelector('.jobs-search-results-list');
                    if (sidebar) {
                        sidebar.scrollBy(0, 1500);
                        return 'sidebar';
                    }
                    
                    // Try finding any element with many children and overflow
                    const allDivs = document.querySelectorAll('div, ul');
                    for (const div of allDivs) {
                        if (div.scrollHeight > div.clientHeight * 2 && div.clientHeight > 200) {
                            div.scrollBy(0, 1500);
                            return 'heuristic';
                        }
                    }
                    
                    // Fallback to window
                    window.scrollBy(0, 1000);
                    return 'window';
                }
            """
            result = self.page.evaluate(scroll_script)
            # print(f"[DEBUG] Scrolled using: {result}")
        except Exception as e:
            # print(f"[WARNING] Scroll error: {e}")
            self.page.evaluate('window.scrollBy(0, 1000)')

    def search_and_collect(self, search_keywords: str) -> List[JobListing]:
        all_jobs = []
        collected_links = set()
        
        if not self.start_browser(): return []
        
        try:
            print(f"[INFO] Searching: {search_keywords}")
            url = self.build_linkedin_url(search_keywords, "r604800")
            self.page.goto(url, wait_until='domcontentloaded')
            self._safe_delay(3)
            
            # Authentication Check
            if "login" in self.page.url:
                print("[WARNING] Login required! Waiting 45s...")
                time.sleep(45)
            
            # Collection Loop
            scroll_count = 0
            no_new_cards_count = 0
            
            while len(all_jobs) < self.max_jobs and scroll_count < 50:
                self._safe_delay(0.5)
                
                # Extract Cards - GENERIC STRATEGY
                # 1. Find the main list container
                # 2. Get all children that contain a link to /jobs/view
                
                job_cards = self.page.query_selector_all('li, div[data-job-id]')
                # Filter strictly for ones with job links to avoid nav items
                # Using a set to dedupe cards pointing to same job
                
                current_batch_count = len(all_jobs)
                
                for card in job_cards:
                    if len(all_jobs) >= self.max_jobs: break
                    
                    try:
                        # Fast check for link
                        link_elem = card.query_selector('a[href*="/jobs/view/"]')
                        if not link_elem: continue
                        
                        href = link_elem.get_attribute('href').split('?')[0]
                        if not href.startswith('http'):
                            href = f"https://www.linkedin.com{href}"
                        
                        if href in collected_links or self.history.exists(href): continue
                        
                        # Extract Details
                        title_elem = card.query_selector('strong, .artdeco-entity-lockup__title') or link_elem
                        company_elem = card.query_selector('.artdeco-entity-lockup__subtitle')
                        
                        title = title_elem.inner_text().strip() if title_elem else "Unknown Title"
                        company = company_elem.inner_text().strip() if company_elem else "Unknown Company"
                        
                        # Blacklist check
                        if any(b in company.lower() for b in self.blacklist_keywords): continue
                        
                        # Premium/Promoted logic (Look for visible text)
                        card_text = card.inner_text().lower()
                        is_promoted = "promoted" in card_text or "premium" in card_text
                        
                        listing = JobListing(
                            company_name=company,
                            job_title=title,
                            job_link=href,
                            posting_date="Recent",
                            role_type="Entry/Intern",
                            is_premium=is_promoted,
                            search_query=search_keywords
                        )
                        
                        all_jobs.append(listing)
                        collected_links.add(href)
                        tag = " [PROMOTED]" if is_promoted else ""
                        print(f"[{len(all_jobs)}] {title[:30]} @ {company[:20]}{tag}")
                        
                    except Exception:
                        continue
                
                # Pagination & Scroll
                new_found = len(all_jobs) > current_batch_count
                if not new_found:
                    no_new_cards_count += 1
                    # print(f"[DEBUG] No new jobs ({no_new_cards_count}/5)")
                    self._smart_scroll()
                    
                    # Try Pagination Buttons
                    if no_new_cards_count >= 2:
                        for sel in ['button[aria-label="Next"]', 'button:has-text("See more jobs")']:
                            btn = self.page.query_selector(sel)
                            if btn and btn.is_visible():
                                btn.click()
                                no_new_cards_count = 0
                                self._safe_delay(2)
                                break
                else:
                    no_new_cards_count = 0
                    self._smart_scroll()
                
                if no_new_cards_count >= 6:
                    print("[INFO] No new jobs found for too long. Stopping.")
                    break
                    
                scroll_count += 1

            # Fetch Descriptions
            print(f"[INFO] Fetching descriptions for {len(all_jobs)} jobs...")
            for i, job in enumerate(all_jobs, 1):
                print(f"[{i}/{len(all_jobs)}] {job.job_title}...", end="\r")
                self.get_description(job)
                self.history.add(job.job_link)
            print("")

        except Exception as e:
            print(f"[ERROR] Search failed: {e}")
            # Debug Dump
            if self.page:
                with open("debug_page.html", "w") as f:
                    f.write(self.page.content())
                print("[INFO] Dumped HTML to debug_page.html")
        
        finally:
            self.history.save_history()
            self.close_browser()
            return all_jobs

    def get_description(self, job: JobListing):
        try:
            self.page.goto(job.job_link, wait_until='domcontentloaded')
            self._safe_delay(1)
            
            # Click See More
            try:
                btn = self.page.query_selector('button:has-text("See more")')
                if btn: btn.click()
            except: pass
            
            # Extract Text
            # Try specific description container first, then article, then main
            desc_elem = self.page.query_selector('.jobs-description__content') or \
                        self.page.query_selector('article') or \
                        self.page.query_selector('main')
            
            text = desc_elem.inner_text().strip() if desc_elem else ""
            job.job_description = text
            job.sponsorship_text = text
            
            # EQUAL OPPORTUNITY CHECK
            if "equal" in text.lower():
                print(f" [MATCH] Equal Opportunity: {job.job_title}")
                job.sponsorship_text = "[EQUAL] " + text
                
        except Exception as e:
            print(f" [WARN] Failed desc: {e}")
