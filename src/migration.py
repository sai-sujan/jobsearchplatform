"""
Migration Script: Excel → SQLite
---------------------------------
One-time migration from jobs_master.xlsx to SQLite database.

Usage:
    python -c "from src.migration import migrate_from_excel; migrate_from_excel()"
"""

import json
from pathlib import Path
from datetime import datetime
from sqlalchemy.orm import Session
from src.database import SessionLocal, init_db
from src.models import Job, User
from src.crud import create_user, job_exists_by_link
from src.settings import settings
from src.scraper.job_scraper import infer_job_source
import pandas as pd
import hashlib


def build_job_id(company: str, title: str, job_link: str) -> str:
    """Generate stable job_id from immutable fields."""
    text = f"{company}|{title}|{job_link}".lower()
    return hashlib.sha1(text.encode()).hexdigest()[:16]


def get_ai_evaluation_from_file(job_title: str, company: str) -> dict:
    """Load AI evaluation JSON sidecar file if it exists."""
    # Sanitize filename
    safe_title = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in job_title)
    safe_company = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in company)
    filename = f"{safe_company}_{safe_title}.json"

    filepath = settings.ANALYSIS_DIR / filename
    if filepath.exists():
        try:
            with open(filepath, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"  Warning: Could not load analysis for {filename}: {e}")

    return None


def migrate_from_excel():
    """Migrate jobs from Excel to SQLite."""
    print("Starting Excel → SQLite migration...\n")

    # Initialize database
    print("1. Creating database tables...")
    init_db()
    print("   ✓ Database initialized\n")

    # Create admin user
    db = SessionLocal()
    print("2. Creating admin user...")
    admin_user = db.query(User).filter(User.username == 'admin').first()
    if not admin_user:
        admin_user = create_user(db, username='admin', password='admin')
        print(f"   ✓ Admin user created (ID: {admin_user.id})\n")
    else:
        print(f"   ℹ Admin user already exists (ID: {admin_user.id})\n")

    # Load Excel file
    print("3. Reading Excel file...")
    if not settings.MASTER_EXCEL.exists():
        print(f"   ✗ Excel file not found: {settings.MASTER_EXCEL}")
        return

    try:
        df = pd.read_excel(settings.MASTER_EXCEL, sheet_name=settings.SHEET_NAME)
        print(f"   ✓ Loaded {len(df)} jobs from {settings.SHEET_NAME}\n")
    except Exception as e:
        print(f"   ✗ Error reading Excel: {e}")
        return

    # Migrate jobs
    print("4. Migrating jobs to database...")
    migrated = 0
    skipped = 0
    errors = 0

    for idx, row in df.iterrows():
        try:
            company = str(row.get('Company', 'Unknown')).strip()
            title = str(row.get('Job_Title', 'Unknown')).strip()
            job_link = str(row.get('Job_Link', '')).strip()

            if not job_link or job_link == 'nan':
                skipped += 1
                continue

            # Check if already exists
            if job_exists_by_link(db, admin_user.id, job_link):
                skipped += 1
                continue

            # Parse date added
            date_added = None
            if 'Date_Added' in row:
                try:
                    date_added = pd.to_datetime(row['Date_Added'])
                except:
                    pass

            # Infer source from job link
            source = infer_job_source(job_link)

            # Get AI evaluation from sidecar file
            ai_evaluation = get_ai_evaluation_from_file(title, company)

            # Parse matched/missing skills
            matched_skills = []
            missing_skills = []
            if pd.notna(row.get('Matched Skills')):
                matched_skills = [s.strip() for s in str(row['Matched Skills']).split(',')]
            if pd.notna(row.get('Missing Skills')):
                missing_skills = [s.strip() for s in str(row['Missing Skills']).split(',')]

            # Create job
            job = Job(
                user_id=admin_user.id,
                source=source,
                company=company,
                title=title,
                job_link=job_link,
                location=str(row.get('Location', '')).strip() if pd.notna(row.get('Location')) else None,
                date_added=date_added,
                job_description=str(row.get('Job_Description', '')).strip() if pd.notna(row.get('Job_Description')) else None,
                role_type='entry',  # Not in Excel, default to entry
                search_query=str(row.get('Search_Query', '')).strip() if pd.notna(row.get('Search_Query')) else None,
                status=str(row.get('Status', 'not_applied')).strip().lower() if pd.notna(row.get('Status')) else 'not_applied',
                skill_score=float(row.get('Skill Score', 0)) if pd.notna(row.get('Skill Score')) else None,
                matched_skills=matched_skills or None,
                missing_skills=missing_skills or None,
                tier=str(row.get('Tier', '')).strip() if pd.notna(row.get('Tier')) else None,
                ai_evaluation=ai_evaluation,
                special_interest=bool(row.get('Special_Interest', 0)) if pd.notna(row.get('Special_Interest')) else False,
                resume_path=str(row.get('Resume Path', '')).strip() if pd.notna(row.get('Resume Path')) else None,
            )

            db.add(job)
            migrated += 1

            if migrated % 10 == 0:
                print(f"   → Migrated {migrated} jobs...")

        except Exception as e:
            print(f"   ✗ Error on row {idx}: {e}")
            errors += 1
            continue

    # Commit all jobs
    db.commit()
    db.close()

    print(f"\n5. Migration complete!")
    print(f"   ✓ Migrated: {migrated}")
    print(f"   ⊘ Skipped: {skipped}")
    print(f"   ✗ Errors: {errors}")
    print(f"\n   Database: {settings.DB_PATH}")


if __name__ == '__main__':
    migrate_from_excel()
