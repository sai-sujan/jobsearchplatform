"""
OutputWriter Module
-------------------
Handles output generation for job evaluation results.
Writes Excel files with formatted evaluation data.
Includes Premium Boost column for LinkedIn Premium/Featured jobs.
"""

import os
from datetime import datetime
from typing import List, Optional
import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils.dataframe import dataframe_to_rows
from ..evaluation.ats_scorer import ScoredJob


class OutputWriter:
    """
    Writes job evaluation results to Excel format.
    Includes Premium Boost column for prioritized jobs.
    """

    COLLUMNS = [
        'Company Name',
        'Search Query',
        'Job Title',
        'Location',
        'Job Link',
        'Posting Date',
        'Role Type',
        'Apply Verdict',
        'Recruiter Verdict',  # Detailed reason
        'Sponsorship Possible',
        'Job Description'     # Last column
    ]

    def __init__(self, output_path: str):
        """
        Initialize OutputWriter.

        Args:
            output_path: Path to output Excel file
        """
        self.output_path = output_path
        self.ensure_output_directory()

    def ensure_output_directory(self):
        """Create output directory if it doesn't exist."""
        output_dir = os.path.dirname(self.output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)
            print(f"[INFO] Created output directory: {output_dir}")

    def _list_to_string(self, items: List[str], separator: str = "\n• ") -> str:
        """Convert list to formatted string."""
        if not items:
            return "None"
        return "• " + separator.join(items)

    def _scored_job_to_row(self, scored_job: ScoredJob) -> dict:
        """Convert ScoredJob to dictionary row."""
        job = scored_job.job
        eval_result = scored_job.evaluation

        # Calculate premium boost display (kept for internal logic but removed from display as requested)
        # premium_boost_str = f"+{scored_job.premium_boost} (Premium)" if scored_job.is_premium else "0"

        # Format sponsorship text
        sponsorship_val = eval_result.sponsorship_possible
        if sponsorship_val == "No":
            sponsorship_val = "Mentioned No Sponsorship"

        # Normalize Verdicts
        apply_verdict = getattr(eval_result, 'apply_verdict', 'Unknown').upper()
        if apply_verdict not in ['YES', 'NO']:
             apply_verdict = 'NO' # Default to strict NO if unclear

        # Clean Recruiter Verdict
        recruiter_verdict = eval_result.recruiter_verdict
        # Ensure it doesn't just say "YES" or "NO", but keeps the reasoning if present.
        # If it's just "YES/NO", we might leave it.

        return {
            'Company Name': job.company_name,
            'Search Query': job.search_query,
            'Job Title': job.job_title,
            'Location': job.location,
            'Job Link': job.job_link,
            'Posting Date': job.posting_date,
            'Role Type': job.role_type,
            'Apply Verdict': apply_verdict,
            'Recruiter Verdict': recruiter_verdict,
            'Sponsorship Possible': sponsorship_val,
            'Job Description': job.job_description[:5000]
        }

    def write_excel(self, scored_jobs: List[ScoredJob]) -> bool:
        """
        Write scored jobs to Excel file.
        Filters out jobs where Apply Verdict is 'NO'.

        Args:
            scored_jobs: List of ScoredJob objects

        Returns:
            True if successful
        """
        try:
            # Filter out rejected jobs
            initial_count = len(scored_jobs)
            scored_jobs = [
                job for job in scored_jobs 
                if getattr(job.evaluation, 'apply_verdict', 'Unknown').upper() != 'NO'
            ]
            
            if len(scored_jobs) < initial_count:
                print(f"[INFO] Filtered out {initial_count - len(scored_jobs)} rejected jobs.")
            
            # Create dataframe
            columns = [
                'Company Name', 'Search Query', 'Job Title', 'Location', 'Job Link', 'Posting Date',
                'Role Type', 'Apply Verdict',
                'Recruiter Verdict', 'Sponsorship Possible', 'Job Description'
            ]
            rows = [self._scored_job_to_row(job) for job in scored_jobs]
            df = pd.DataFrame(rows, columns=columns)

            # Sort by intended order (just preserve list order or sort by date if needed?)
            # Premium jobs are usually first if scraped order is preserved?
            # Let's just keep them as-is since 'ATS Score' is gone.
            
            # Write to Excel
            df.to_excel(self.output_path, index=False, engine='openpyxl')

            # Apply formatting
            self._apply_formatting()

            print(f"[SUCCESS] Excel file saved to: {self.output_path}")
            return True

        except Exception as e:
            print(f"[ERROR] Failed to write Excel: {e}")
            return False

    def _apply_formatting(self):
        """Apply Excel formatting for better readability."""
        try:
            wb = load_workbook(self.output_path)
            ws = wb.active

            # Define styles
            header_font = Font(bold=True, color="FFFFFF")
            header_fill = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
            header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

            cell_alignment = Alignment(vertical="top", wrap_text=True)

            thin_border = Border(
                left=Side(style='thin'),
                right=Side(style='thin'),
                top=Side(style='thin'),
                bottom=Side(style='thin')
            )

            # Color fills for ATS scores
            high_score_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
            medium_score_fill = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
            low_score_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")

            # Premium fill (gold/yellow highlight)
            premium_fill = PatternFill(start_color="FFD700", end_color="FFD700", fill_type="solid")

            # Format header row
            for col_num, column_title in enumerate(OutputWriter.COLLUMNS, 1):
                cell = ws.cell(row=1, column=col_num)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_alignment
                cell.border = thin_border

            # Format data rows
            for row_num in range(2, ws.max_row + 1):
                for col_num in range(1, ws.max_column + 1):
                    cell = ws.cell(row=row_num, column=col_num)
                    cell.alignment = cell_alignment
                    cell.border = thin_border

                # Color code Sponsorship column (column 10 = J)
                sponsor_cell = ws.cell(row=row_num, column=10)
                if sponsor_cell.value and "Yes" in str(sponsor_cell.value):
                    sponsor_cell.fill = high_score_fill
                elif sponsor_cell.value and "No" in str(sponsor_cell.value):
                    sponsor_cell.fill = low_score_fill

            # Set column widths
            column_widths = {
                'A': 20,  # Company Name
                'B': 30,  # Search Query
                'C': 30,  # Job Title
                'D': 20,  # Location
                'E': 50,  # Job Link
                'F': 12,  # Posting Date
                'G': 12,  # Role Type
                'H': 15,  # Apply Verdict
                'I': 50,  # Recruiter Verdict
                'J': 15,  # Sponsorship Possible
                'K': 60,  # Job Description
            }

            for col_letter, width in column_widths.items():
                ws.column_dimensions[col_letter].width = width

            # Set row heights
            ws.row_dimensions[1].height = 40  # Header row

            for row_num in range(2, ws.max_row + 1):
                ws.row_dimensions[row_num].height = 80  # Data rows

            # Freeze header row
            ws.freeze_panes = 'A2'

            # Save formatted workbook
            wb.save(self.output_path)
            print("[INFO] Excel formatting applied")

        except Exception as e:
            print(f"[WARNING] Could not apply Excel formatting: {e}")

    def write_summary_sheet(self, scored_jobs: List[ScoredJob], stats: dict):
        """Summary sheet disabled as per user request."""
        pass

    def append_to_existing(self, scored_jobs: List[ScoredJob]) -> bool:
        """
        Append new results to existing Excel file.

        Args:
            scored_jobs: List of ScoredJob objects

        Returns:
            True if successful
        """
        try:
            if os.path.exists(self.output_path):
                # Load existing data
                existing_df = pd.read_excel(self.output_path, sheet_name='Sheet1')

                # Create new data
                new_rows = [self._scored_job_to_row(job) for job in scored_jobs]
                new_df = pd.DataFrame(new_rows, columns=self.COLUMNS)

                # Combine and deduplicate by Job Link
                combined_df = pd.concat([existing_df, new_df], ignore_index=True)
                combined_df = combined_df.drop_duplicates(subset=['Job Link'], keep='last')

                # Sort by ATS Score
                combined_df = combined_df.sort_values('ATS Score', ascending=False)

                # Write back
                combined_df.to_excel(self.output_path, index=False, engine='openpyxl')
                self._apply_formatting()

                print(f"[INFO] Appended {len(new_rows)} new jobs to existing file")
                return True
            else:
                # No existing file, create new
                return self.write_excel(scored_jobs)

        except Exception as e:
            print(f"[ERROR] Failed to append to Excel: {e}")
            return False
