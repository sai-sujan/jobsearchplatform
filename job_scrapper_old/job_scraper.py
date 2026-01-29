"""
JobScraper Module
-----------------
Handles LinkedIn job search automation using Playwright.
Detects Premium/Featured jobs and applies relevance boost.
"""

import os
import time
import random
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
    role_type: str  # Entry-level, Internship, etc.
    job_description: str = ""
    location: str = ""
    sponsorship_text: str = ""
    is_premium: bool = False  # LinkedIn Premium/Featured job indicator
    premium_indicators: str = ""  # What made it premium (for tracking)
    search_query: str = ""  # The search query used to find this job


class JobScraper:
    """
    LinkedIn Job Scraper using Playwright.
    Detects Premium jobs for priority ranking.
    """

    def __init__(
        self,
        chrome_path: str,
        chrome_profile_path: str,
        blacklist_path: str,
        action_delay: float = 2.0,
        max_jobs: int = 40
    ):
        self.chrome_path = chrome_path
        self.chrome_profile_path = chrome_profile_path
        self.action_delay = action_delay
        self.max_jobs = max_jobs
        self.blacklist_keywords = self._load_blacklist(blacklist_path)

        # Initialize History Manager for deduplication
        from history_manager import HistoryManager
        self.history = HistoryManager()
        print(f"[INFO] Loaded history with {len(self.history.processed_urls)} past jobs.")

        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None

    def _load_blacklist(self, blacklist_path: str) -> List[str]:
        """Load company blacklist keywords from file."""
        keywords = []
        if os.path.exists(blacklist_path):
            with open(blacklist_path, 'r') as f:
                for line in f:
                    line = line.strip().lower()
                    if line and not line.startswith('#'):
                        keywords.append(line)
        print(f"[INFO] Loaded {len(keywords)} blacklist keywords")
        return keywords

    def _is_blacklisted(self, company_name: str) -> bool:
        """Check if company name contains any blacklisted keyword."""
        company_lower = company_name.lower()
        for keyword in self.blacklist_keywords:
            if keyword in company_lower:
                return True
        return False

    def _safe_delay(self, multiplier: float = 1.0):
        """Add a randomized delay to avoid detection."""
        delay = self.action_delay * multiplier * (0.8 + random.random() * 0.4)
        time.sleep(delay)

    def start_browser(self) -> bool:
        """Launch system Chrome with persistent session."""
        try:
            print("[INFO] Starting Chrome browser...")
            self.playwright = sync_playwright().start()

            # Use a local session directory to persist login
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            session_dir = os.path.join(base_dir, 'chrome_session')
            os.makedirs(session_dir, exist_ok=True)

            # Launch system Chrome
            self.context = self.playwright.chromium.launch_persistent_context(
                user_data_dir=session_dir,
                channel='chrome',
                headless=False,
                slow_mo=50,
                args=['--disable-blink-features=AutomationControlled']
            )

            self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
            print("[INFO] Chrome browser started successfully")
            return True

        except Exception as e:
            print(f"[ERROR] Failed to start browser: {e}")
            return False

    def close_browser(self):
        """Close the browser and cleanup."""
        try:
            if self.context:
                self.context.close()
                self.context = None
            if self.playwright:
                self.playwright.stop()
                self.playwright = None
            self.page = None
            print("[INFO] Browser closed")
        except Exception as e:
            print(f"[WARNING] Error closing browser: {e}")

    def build_linkedin_url(self, keywords: str, time_filter: str = "r604800") -> str:
        """
        Build LinkedIn Jobs search URL with filters.
        time_filter: 'r86400' (24h) or 'r604800' (week)
        """
        encoded_keywords = quote_plus(keywords)
        # f_E=1,2 = Internship + Entry level
        # f_TPR=r604800/r86400 = Past week/24hr
        # f_WT=2 = Remote
        url = (
            f"https://www.linkedin.com/jobs/search/?"
            f"keywords={encoded_keywords}"
            f"&f_E=1%2C2"
            f"&f_TPR={time_filter}"
            f"&sortBy=R"
        )
        return url

    def navigate_to_linkedin_jobs(self, search_keywords: str, time_filter: str = "r604800") -> bool:
        """Navigate to LinkedIn Jobs search page."""
        try:
            url = self.build_linkedin_url(search_keywords, time_filter)
            print(f"[INFO] Navigating to LinkedIn Jobs...")

            self.page.goto(url, wait_until='domcontentloaded', timeout=60000)
            self._safe_delay(3)

            # Check if login needed
            if "login" in self.page.url or "authwall" in self.page.url:
                print("[WARNING] Please log in to LinkedIn manually...")
                print("[INFO] Waiting 45 seconds for login...")
                time.sleep(45)
                self.page.goto(url, wait_until='domcontentloaded', timeout=60000)
                self._safe_delay(3)

            if "/jobs/" not in self.page.url:
                print("[ERROR] Not on LinkedIn Jobs page")
                return False

            print(f"[INFO] Successfully loaded jobs for: {search_keywords}")
            return True

        except Exception as e:
            print(f"[ERROR] Navigation failed: {e}")
            return False

    def _detect_premium_job(self, card) -> tuple:
        """
        Detect if a job card is Premium/Featured.

        Returns:
            Tuple of (is_premium: bool, indicators: str)
        """
        indicators = []

        try:
            card_html = card.inner_html().lower()
            card_text = card.inner_text().lower()

            # Check for Premium indicators
            premium_patterns = [
                'premium',
                'featured',
                'promoted',
                'applicants like you',
                'top applicant',
                'actively recruiting',
                'early applicant',
                'be an early applicant',
                'hiring multiple candidates',
                'urgently hiring',
                'job-card-container__footer-item--highlighted',
                'job-card__spotlight',
            ]

            for pattern in premium_patterns:
                if pattern in card_html or pattern in card_text:
                    indicators.append(pattern)

            # Check for premium badge elements
            badge_selectors = [
                '[class*="premium"]',
                '[class*="featured"]',
                '[class*="promoted"]',
                '[class*="spotlight"]',
                '[class*="insight"]',
                '.job-card-container__footer-item',
            ]

            for selector in badge_selectors:
                try:
                    elem = card.query_selector(selector)
                    if elem:
                        text = elem.inner_text().strip().lower()
                        if any(p in text for p in ['premium', 'featured', 'early', 'actively', 'hiring']):
                            indicators.append(f"badge:{text[:30]}")
                except:
                    pass

            is_premium = len(indicators) > 0
            indicator_str = "; ".join(set(indicators))[:100] if indicators else ""

            return is_premium, indicator_str

        except Exception as e:
            return False, ""

    def collect_job_listings(self, existing_links: set = None, search_query: str = "") -> List[JobListing]:
        """Collect job listings with Premium detection."""
        jobs = []
        collected_links = existing_links if existing_links is not None else set()

        print(f"[INFO] Collecting up to {self.max_jobs} job listings...")

        try:
            scroll_count = 0
            max_scrolls = 50  # increased for more thorough scraping
            visited_links = set() # Track ALL seen links to prevent loops

            while len(jobs) < self.max_jobs and scroll_count < max_scrolls:
                self._safe_delay(1)

                # Wait for job cards
                try:
                    self.page.wait_for_selector(
                        '.jobs-search-results__list-item, .scaffold-layout__list-item, [data-job-id]',
                        timeout=5000
                    )
                except:
                    pass

                # Get job cards
                job_cards = self.page.query_selector_all(
                    '.jobs-search-results__list-item, .scaffold-layout__list-item'
                )
                if not job_cards:
                    job_cards = self.page.query_selector_all('[data-job-id]')

                # Only print count if it changes roughly
                # print(f"[DEBUG] Found {len(job_cards)} job cards")

                new_cards_found = False

                for card in job_cards:
                    if len(jobs) >= self.max_jobs:
                        break

                    try:
                        job = self._extract_job_from_card(card, search_query)

                        if job and job.job_link:
                            # Skip if we've already physically seen this link on this run
                            if job.job_link in visited_links:
                                continue

                            visited_links.add(job.job_link)
                            new_cards_found = True

                            # Check global collected (across stages)
                            # Check persistent history
                            if self.history.exists(job.job_link):
                                # print(f"[SKIP] Already processed in history: {job.company_name}")
                                continue

                            if self._is_blacklisted(job.company_name):
                                print(f"[SKIP] Blacklisted: {job.company_name}")
                                continue

                            collected_links.add(job.job_link)
                            self.history.add(job.job_link) # Add to persistent history
                            jobs.append(job)

                            premium_tag = " [PREMIUM]" if job.is_premium else ""
                            print(f"[{len(jobs)}] {job.job_title[:35]} @ {job.company_name[:20]}{premium_tag}")

                    except Exception:
                        continue

                # Scroll logic
                if not new_cards_found:
                    print("[DEBUG] No new cards found, scrolling aggressive...")
                    self.page.evaluate('window.scrollBy(0, 1000)')
                else:
                    self.page.evaluate('window.scrollBy(0, 600)')

                self._safe_delay(1.5)
                scroll_count += 1

                # Click "See more" if available
                try:
                    see_more = self.page.query_selector('button:has-text("See more jobs")')
                    if see_more:
                        see_more.click()
                        self._safe_delay(2)
                except:
                    pass

            # Count premium jobs
            premium_count = sum(1 for j in jobs if j.is_premium)
            print(f"[INFO] Collected {len(jobs)} jobs ({premium_count} Premium)")
            return jobs

        except Exception as e:
            print(f"[ERROR] Failed to collect jobs: {e}")
            return jobs

    def _extract_job_from_card(self, card, search_query: str = "") -> Optional[JobListing]:
        """Extract job details including Premium status."""
        try:
            # Detect Premium status first
            is_premium, premium_indicators = self._detect_premium_job(card)

            # Get job title
            title_elem = (
                card.query_selector('.job-card-list__title') or
                card.query_selector('.job-card-container__link') or
                card.query_selector('.artdeco-entity-lockup__title') or
                card.query_selector('strong')
            )
            job_title = title_elem.inner_text().strip() if title_elem else ""

            # Get company name
            company_elem = (
                card.query_selector('.job-card-container__primary-description') or
                card.query_selector('.job-card-container__company-name') or
                card.query_selector('.artdeco-entity-lockup__subtitle')
            )
            company_name = company_elem.inner_text().strip().split('\n')[0] if company_elem else ""

            # Get job link
            link_elem = (
                card.query_selector('a[href*="/jobs/view/"]') or
                card.query_selector('a.job-card-container__link')
            )
            job_link = ""
            if link_elem:
                href = link_elem.get_attribute('href')
                if href:
                    job_link = href if href.startswith('http') else f'https://www.linkedin.com{href}'
                    job_link = job_link.split('?')[0]

            # Get location
            location_elem = card.query_selector('.job-card-container__metadata-item')
            location = location_elem.inner_text().strip() if location_elem else ""

            # Get posting time
            time_elem = card.query_selector('time')
            posting_date = time_elem.inner_text().strip() if time_elem else "Recent"

            # Determine role type
            role_type = self._determine_role_type(job_title)

            if job_title and company_name and job_link:
                return JobListing(
                    company_name=company_name,
                    job_title=job_title,
                    job_link=job_link,
                    posting_date=posting_date,
                    role_type=role_type,
                    location=location,
                    is_premium=is_premium,
                    premium_indicators=premium_indicators,
                    search_query=search_query
                )

            return None

        except Exception:
            return None

    def _determine_role_type(self, job_title: str) -> str:
        """Determine role type from title."""
        title_lower = job_title.lower()
        if 'intern' in title_lower:
            return 'Internship'
        elif any(x in title_lower for x in ['entry', 'junior', 'jr.', 'associate', ' i ', ' i,']):
            return 'Entry-level'
        elif any(x in title_lower for x in ['senior', 'sr.', 'lead', 'principal', 'staff']):
            return 'Senior'
        return 'Entry-level'

    def get_job_description(self, job: JobListing) -> str:
        """Navigate to job and extract description."""
        try:
            print(f"[INFO] Fetching: {job.job_title[:40]}...")

            self.page.goto(job.job_link, wait_until='domcontentloaded', timeout=30000)
            self._safe_delay(2)

            # Expand description
            try:
                see_more = self.page.query_selector('button:has-text("See more")')
                if see_more and see_more.is_visible():
                    see_more.click()
                    self._safe_delay(1)
            except:
                pass

            # Extract description
            description = ""
            for selector in ['.jobs-description__content', '.jobs-box__html-content', '[class*="description"]']:
                elem = self.page.query_selector(selector)
                if elem:
                    text = elem.inner_text().strip()
                    if len(text) > len(description):
                        description = text

            if len(description) < 100:
                main = self.page.query_selector('main')
                if main:
                    description = main.inner_text()[:5000]

            job.job_description = description
            job.sponsorship_text = description
            return description

        except Exception as e:
            print(f"[WARNING] Failed to get description: {e}")
            return ""

    def search_and_collect(self, search_keywords: str) -> List[JobListing]:
        """Full workflow: navigate and collect jobs (24h then Week)."""
        all_jobs = []
        collected_links = set()

        try:
            if not self.start_browser():
                return all_jobs

            # Stage 1: Past 24 Hours (COMMENTED OUT FOR ONE-TIME PAST WEEK SCAN)
            # print(f"\n[INFO] --- STAGE 1: Searching Past 24 Hours ---")
            # if self.navigate_to_linkedin_jobs(search_keywords, time_filter="r86400"):
            #      fresh_jobs = self.collect_job_listings(collected_links, search_query=search_keywords)
            #      # collected_links is updated in-place by collect_job_listings
            #      all_jobs.extend(fresh_jobs)

            # Stage 2: Past Week (NOW PRIMARY SEARCH)
            # if len(all_jobs) < self.max_jobs:
            #     needed = self.max_jobs - len(all_jobs)
            #     print(f"\n[INFO] Only found {len(all_jobs)} jobs in 24h. Need {needed} more.")
            print(f"[INFO] --- Searching Past 24 Hours ---")

            if self.navigate_to_linkedin_jobs(search_keywords, time_filter="r86400"):
                week_jobs = self.collect_job_listings(collected_links, search_query=search_keywords)
                all_jobs.extend(week_jobs)

            if not all_jobs:
                print("[WARNING] No jobs found in 24h or Week.")
                return all_jobs

            # Get descriptions
            print(f"\n[INFO] Fetching job descriptions for {len(all_jobs)} jobs...")
            for i, job in enumerate(all_jobs, 1):
                print(f"[{i}/{len(all_jobs)}] ", end="")
                self.get_job_description(job)
                self._safe_delay(1)

            return all_jobs

        except Exception as e:
            print(f"[ERROR] Search failed: {e}")
            import traceback
            traceback.print_exc()
            return all_jobs

        finally:
            self.history.save_history()
            print("\n[INFO] Job collection complete.")
