"""
Excel Manager - Handles Excel file operations

SAFETY FEATURES:
- Aborts on read errors (never loses data silently)
- Creates backup before every write
- Uses absolute paths
- File locking to prevent concurrent writes
"""

import pandas as pd
import os
import shutil
import fcntl
from typing import List
from datetime import datetime
from pathlib import Path
from ..settings import settings


class ExcelManager:
    """Manages Excel operations for job listings with data safety."""

    STANDARD_COLUMNS = [
        'Status',
        'Company',
        'Job_Title',
        'Location',
        'Job_Link',
        'Posting_Date',
        'Date_Added',
        'Keywords_Matching_Score',
        'Analysis_File',
        'Analysis_JSON',
        'Job_Description',
        'Search_Query',
        'Role_Type',
        'Is_Premium',
        'Premium_Indicators',
        'Resume Path'
    ]

    def __init__(self, master_file: str):
        # Convert to absolute path
        self.master_file = Path(master_file).absolute()
        self.backup_dir = self.master_file.parent / "backups"
        self.lock_file = self.master_file.parent / f".{self.master_file.stem}.lock"
        self._lock_fd = None

    def _acquire_lock(self):
        """Acquire file lock to prevent concurrent writes."""
        try:
            self._lock_fd = open(self.lock_file, 'w')
            fcntl.flock(self._lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except (IOError, OSError):
            print("[ERROR] Another process is using the Excel file. Wait for it to finish.")
            return False

    def _release_lock(self):
        """Release file lock."""
        if self._lock_fd:
            try:
                fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
                self._lock_fd.close()
                os.remove(self.lock_file)
            except OSError:
                pass
            self._lock_fd = None

    def _create_backup(self):
        """Create a backup before writing. CRITICAL for data safety."""
        if not self.master_file.exists():
            return None

        self.backup_dir.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = self.backup_dir / f"{self.master_file.stem}_backup_{timestamp}.xlsx"

        try:
            shutil.copy2(self.master_file, backup_path)
            print(f"[BACKUP] Created: {backup_path.name}")

            # Keep only last 10 backups
            backups = sorted(self.backup_dir.glob(f"{self.master_file.stem}_backup_*.xlsx"))
            if len(backups) > 10:
                for old_backup in backups[:-10]:
                    old_backup.unlink()

            return backup_path
        except Exception as e:
            print(f"[ERROR] Failed to create backup: {e}")
            return None

    def load_existing_jobs(self) -> pd.DataFrame:
        """
        Load existing jobs from Excel file.
        ABORTS on error to prevent data loss.
        """
        if not self.master_file.exists():
            print(f"[INFO] No existing file found, will create new: {self.master_file.name}")
            return pd.DataFrame()

        try:
            # Try reading with different sheet names
            try:
                df = pd.read_excel(self.master_file, sheet_name=settings.SHEET_NAME)
            except (KeyError, ValueError):
                df = pd.read_excel(self.master_file, sheet_name=0)

            if len(df) == 0:
                print(f"[WARNING] Excel file exists but has 0 rows!")
                print(f"[WARNING] Check backups in: {self.backup_dir}")
            else:
                print(f"[INFO] Loaded {len(df)} existing jobs from {self.master_file.name}")

            return df

        except Exception as e:
            print(f"[ERROR] Could not load Excel file: {e}")
            print(f"[ERROR] Aborting to prevent data loss.")
            print(f"[ERROR] Check backups in: {self.backup_dir}")
            raise RuntimeError(f"Failed to load Excel: {e}")

    def _normalize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Normalize column names to handle different formats.
        Maps old column names to new standard names.
        """
        column_mappings = {
            'company_name': 'Company',
            'job_title': 'Job_Title',
            'job_link': 'Job_Link',
            'posting_date': 'Posting_Date',
            'role_type': 'Role_Type',
            'location': 'Location',
            'is_premium': 'Is_Premium',
            'premium_indicators': 'Premium_Indicators',
            'search_query': 'Search_Query',
            'job_description': 'Job_Description',
            'date_added': 'Date_Added',
            'Company Name': 'Company',
            'Job Title': 'Job_Title',
            'Title': 'Job_Title',
            'Job Link': 'Job_Link',
            'Link': 'Job_Link',
            'Posting Date': 'Posting_Date',
            'Role Type': 'Role_Type',
            'Skill Score': 'Keywords_Matching_Score',
            'skill_score': 'Keywords_Matching_Score',
            'New': 'Status',
            'status': 'Status',
            'Analysis File': 'Analysis_File',
            'Analysis JSON': 'Analysis_JSON',
            'Search Query': 'Search_Query',
            'Job Description': 'Job_Description',
            'Date Found': 'Date_Added'
        }

        df = df.rename(columns=column_mappings)

        # Deduplicate columns if rename created duplicates
        if len(df.columns) != len(set(df.columns)):
            df = df.loc[:, ~df.columns.duplicated()]

        return df

    def update_master_list(self, new_jobs: List) -> int:
        """
        Add new jobs to master Excel file.
        Returns count of jobs actually added.

        SAFETY: Creates backup before writing, aborts on read error.
        """
        if not new_jobs:
            print("[INFO] No new jobs to add")
            return 0

        # Acquire lock
        if not self._acquire_lock():
            raise RuntimeError("Could not acquire file lock")

        try:
            # Load existing jobs (will abort on error)
            existing_df = self.load_existing_jobs()

            # Normalize column names if file exists
            if not existing_df.empty:
                existing_df = self._normalize_column_names(existing_df)

            # Convert new jobs to DataFrame
            new_data = []
            for job in new_jobs:
                skill_score = getattr(job, 'skill_score', 0)
                matched_skills = getattr(job, 'matched_skills', [])
                missing_skills = getattr(job, 'missing_skills', [])
                tier = getattr(job, 'tier', '')

                new_data.append({
                    'Status': 'New',
                    'Company': job.company_name,
                    'Job_Title': job.job_title,
                    'Location': job.location if job.location else 'Location not specified',
                    'Job_Link': job.job_link,
                    'Date_Added': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'Keywords_Matching_Score': skill_score,
                    'Match': '',
                    'Tier': tier,
                    'Matched Skills': ', '.join(matched_skills[:10]) if matched_skills else '',
                    'Missing Skills': ', '.join(missing_skills[:10]) if missing_skills else '',
                    'Verdict': '',
                    'Reason': '',
                    'Applied': 'Not Applied',
                    'Search_Query': job.search_query,
                    'Job_Description': job.job_description[:15000] if job.job_description else '',
                    'Analysis_File': ''
                })

            new_df = pd.DataFrame(new_data)

            # Remove duplicates based on Job_Link
            if not existing_df.empty and 'Job_Link' in existing_df.columns:
                existing_links = set(existing_df['Job_Link'].astype(str).tolist())
                new_df = new_df[~new_df['Job_Link'].astype(str).isin(existing_links)]

            added_count = len(new_df)

            if added_count == 0:
                print("[INFO] All jobs already exist in master file")
                return 0

            # Combine DataFrames
            if existing_df.empty:
                final_df = new_df
            else:
                # Preserve all existing columns
                existing_columns = list(existing_df.columns)

                for col in new_df.columns:
                    if col not in existing_columns:
                        existing_df[col] = None

                for col in existing_columns:
                    if col not in new_df.columns:
                        new_df[col] = None

                new_df = new_df[existing_df.columns]
                final_df = pd.concat([existing_df, new_df], ignore_index=True)

            # CRITICAL: Validate before writing
            if final_df.empty:
                print("[ERROR] Refusing to write empty DataFrame!")
                raise RuntimeError("Cannot write empty DataFrame")

            if not existing_df.empty and len(final_df) < len(existing_df):
                print(f"[ERROR] Data loss detected! Final ({len(final_df)}) < Existing ({len(existing_df)})")
                raise RuntimeError("Data loss would occur, aborting")

            # Sort by date added (newest first)
            if 'Date_Added' in final_df.columns:
                final_df = final_df.sort_values('Date_Added', ascending=False)

            # Create backup BEFORE writing
            self._create_backup()

            # Save to Excel
            try:
                final_df.to_excel(self.master_file, index=False, engine='openpyxl')
                print(f"[SUCCESS] Added {added_count} new jobs to {self.master_file.name}")
                print(f"[INFO] Total jobs in master file: {len(final_df)}")
                return added_count

            except Exception as e:
                print(f"[ERROR] Failed to save Excel file: {e}")

                # Try saving to backup file
                backup_file = self.master_file.parent / f"{self.master_file.stem}_emergency_backup.xlsx"
                try:
                    final_df.to_excel(backup_file, index=False, engine='openpyxl')
                    print(f"[SUCCESS] Saved to emergency backup: {backup_file.name}")
                    return added_count
                except Exception as e2:
                    print(f"[ERROR] Failed to save backup: {e2}")
                    raise RuntimeError(f"Failed to save data: {e}")

        finally:
            self._release_lock()
