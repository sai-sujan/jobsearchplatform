#!/usr/bin/env python3
"""Debug script to explore LinkedIn's job page structure."""

import os
import time
from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv()

chrome_path = os.getenv('CHROME_PATH')
chrome_profile = os.getenv('CHROME_PROFILE_PATH')

print("Starting browser...")
pw = sync_playwright().start()

context = pw.chromium.launch_persistent_context(
    user_data_dir=chrome_profile,
    executable_path=chrome_path,
    headless=False,
    slow_mo=100,
    args=['--disable-blink-features=AutomationControlled']
)

page = context.pages[0] if context.pages else context.new_page()

url = "https://www.linkedin.com/jobs/search/?keywords=machine+learning+engineer&f_E=1%2C2&f_TPR=r604800&f_WT=2&sortBy=DD"
print(f"Navigating to: {url}")
page.goto(url, wait_until='domcontentloaded', timeout=60000)

print("Waiting for page to load...")
time.sleep(5)

print("\n=== Page URL ===")
print(page.url)

print("\n=== Checking for common job card selectors ===")
selectors_to_try = [
    '.jobs-search-results__list-item',
    '.scaffold-layout__list-item',
    '.job-card-container',
    '[data-job-id]',
    '.jobs-search-results-list',
    '.jobs-search__results-list',
    'li.jobs-search-results__list-item',
    '.job-card-list',
    'ul.scaffold-layout__list-container > li',
    '.jobs-search-two-pane__results',
    'div[data-job-id]',
]

for sel in selectors_to_try:
    count = len(page.query_selector_all(sel))
    print(f"  {sel}: {count} elements")

print("\n=== Looking for any list items in main content ===")
main = page.query_selector('main')
if main:
    lis = main.query_selector_all('li')
    print(f"  Found {len(lis)} <li> elements in main")

    # Check first few list items
    for i, li in enumerate(lis[:3]):
        classes = li.get_attribute('class') or ''
        print(f"    li[{i}] classes: {classes[:80]}")

print("\n=== Sample HTML from results area ===")
results_area = page.query_selector('.jobs-search-results-list, .scaffold-layout__list-container, main ul')
if results_area:
    html = results_area.inner_html()[:2000]
    print(html)
else:
    print("Could not find results area")

print("\n=== Keeping browser open for 60 seconds for inspection ===")
print("Press Ctrl+C to exit earlier")
try:
    time.sleep(60)
except KeyboardInterrupt:
    pass

context.close()
pw.stop()
