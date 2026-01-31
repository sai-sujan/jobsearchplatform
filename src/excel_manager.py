"""
Excel Manager - Handles Excel file operations
"""

import pandas as pd
import os
from typing import List
from datetime import datetime



class ExcelManager:
    """Manages Excel operations for job listings."""
    
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
        self.master_file = master_file
        
    def load_existing_jobs(self) -> pd.DataFrame:
        """Load existing jobs from Excel file."""
        if os.path.exists(self.master_file):
            try:
                df = pd.read_excel(self.master_file)
                print(f"[INFO] Loaded {len(df)} existing jobs from {self.master_file}")
                return df
            except Exception as e:
                print(f"[WARNING] Could not load Excel file: {e}")
                return pd.DataFrame()
        else:
            print(f"[INFO] No existing file found, will create new: {self.master_file}")
            return pd.DataFrame()
    
    def _normalize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Normalize column names to handle different formats.
        Maps old column names to new standard names.
        """
        # Column name mappings (old -> new)
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
            
            # Handle spaces/underscores variations
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
        
        # Rename columns if they exist
        df = df.rename(columns=column_mappings)
        
        # Deduplicate columns if rename created duplicates (e.g. Title and Job_Title existed)
        if len(df.columns) != len(set(df.columns)):
            df = df.loc[:, ~df.columns.duplicated()]
            
        return df
    
    def update_master_list(self, new_jobs: List) -> int:
        """
        Add new jobs to master Excel file.
        Returns count of jobs actually added.
        IMPORTANT: Preserves ALL existing columns - never drops data.
        """
        if not new_jobs:
            print("[INFO] No new jobs to add")
            return 0

        # Load existing jobs
        existing_df = self.load_existing_jobs()

        # Normalize column names if file exists
        if not existing_df.empty:
            existing_df = self._normalize_column_names(existing_df)

        # Convert new jobs to DataFrame - use columns that match existing file
        new_data = []
        for job in new_jobs:
            new_data.append({
                'Status': 'New',
                'Company': job.company_name,
                'Job_Title': job.job_title,
                'Location': job.location if job.location else 'Location not specified',
                'Job_Link': job.job_link,
                'Date_Added': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'Keywords_Matching_Score': 0,
                'Match': '',
                'Tier': '',
                'Matched Skills': '',
                'Missing Skills': '',
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

        # Combine and save - PRESERVE ALL EXISTING COLUMNS
        if existing_df.empty:
            final_df = new_df
        else:
            # Get all columns from existing file (preserve everything!)
            existing_columns = list(existing_df.columns)

            # Add any new columns from new_df that don't exist
            for col in new_df.columns:
                if col not in existing_columns:
                    existing_df[col] = None

            # Ensure new_df has all columns from existing file
            for col in existing_columns:
                if col not in new_df.columns:
                    new_df[col] = None

            # Reorder new_df columns to match existing file
            new_df = new_df[existing_df.columns]

            # Combine: existing jobs first, new jobs appended at bottom
            final_df = pd.concat([existing_df, new_df], ignore_index=True)

        # Sort by date added (newest first)
        if 'Date_Added' in final_df.columns:
            final_df = final_df.sort_values('Date_Added', ascending=False)

        # Save to Excel
        try:
            final_df.to_excel(self.master_file, index=False, engine='openpyxl')
            print(f"[SUCCESS] Added {added_count} new jobs to {self.master_file}")
            print(f"[INFO] Total jobs in master file: {len(final_df)}")
            return added_count
        except Exception as e:
            print(f"[ERROR] Failed to save Excel file: {e}")

            # Try saving to backup file
            backup_file = self.master_file.replace('.xlsx', '_backup.xlsx')
            try:
                final_df.to_excel(backup_file, index=False, engine='openpyxl')
                print(f"[SUCCESS] Saved to backup file: {backup_file}")
                return added_count
            except Exception as e2:
                print(f"[ERROR] Failed to save backup: {e2}")
                return 0
