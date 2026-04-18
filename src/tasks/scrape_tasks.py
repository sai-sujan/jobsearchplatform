import os
from celery import shared_task
from src.database import SessionLocal
from src.models import Job, MatchedJob, ScrapeRun
from src.tasks.celery_app import app as celery_app
from src.scraper.job_scraper import JobScraper
from datetime import datetime
import uuid

@celery_app.task(name="src.tasks.scrape_tasks.run_job_search", bind=True)
def run_job_search(self, user_id: str, keywords: str, max_jobs: int = 10):
    """
    Background task to run LinkedIn scraping.
    """
    db = SessionLocal()
    scrape_run = ScrapeRun(user_id=user_id, status="running", source="linkedin", search_query=keywords)
    db.add(scrape_run)
    db.commit()

    try:
        # 1. Initialize Scraper (requires Chromium & 1GB RAM)
        scraper = JobScraper(
            chrome_path=os.getenv("CHROME_PATH", "/usr/bin/google-chrome"),
            chrome_profile_path=os.getenv("CHROME_PROFILE_PATH"),
            max_jobs=max_jobs
        )

        # 2. Collect Jobs
        job_listings = scraper.search_and_collect(keywords)
        
        # 3. Process & Save
        new_jobs_count = 0
        for listing in job_listings:
            # Deduplication
            existing = db.query(Job).filter(Job.job_link == listing.job_link).first()
            if not existing:
                new_job = Job(
                    user_id=user_id,
                    source="linkedin",
                    company=listing.company_name,
                    title=listing.job_title,
                    job_link=listing.job_link,
                    job_description=listing.job_description,
                    location=listing.location,
                    is_premium=listing.is_premium
                )
                db.add(new_job)
                db.flush() # Get ID
                
                # Create default match entry
                match = MatchedJob(
                    user_id=user_id,
                    job_id=new_job.id,
                    delivery_origin="automation_v1",
                    fit_score=0 # AI eval will update this
                )
                db.add(match)
                new_jobs_count += 1
                
                # Trigger AI evaluation task for the new job
                from src.tasks.job_tasks import process_ai_evaluation
                process_ai_evaluation.delay(str(new_job.id), user_id)

        scrape_run.status = "done"
        scrape_run.jobs_found = new_jobs_count
        scrape_run.finished_at = datetime.utcnow()
        db.commit()
        
        return {"status": "success", "jobs_found": new_jobs_count}

    except Exception as e:
        db.rollback()
        scrape_run.status = "failed"
        scrape_run.error_msg = str(e)
        scrape_run.finished_at = datetime.utcnow()
        db.commit()
        # ALERT: System Architect's Selector Failure Alerting
        print(f"[CRITICAL] Scraper Failure for User {user_id}: {e}")
        return {"status": "error", "message": str(e)}
        
    finally:
        db.close()
