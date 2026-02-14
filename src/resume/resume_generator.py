#!/usr/bin/env python3
"""
Resume Generator - Creates customized LaTeX resumes for each job application.
Reads job data from Excel and generates PDFs with tailored content.
"""

import os
import re
import subprocess
import shutil
from pathlib import Path
from datetime import datetime
import pandas as pd

from ..settings import settings


class ResumeGenerator:
    """Generates customized LaTeX resumes from job application data."""

    def __init__(self, base_dir: Path = None):
        self.base_dir = base_dir or settings.BASE_DIR
        self.template_path = settings.LATEX_TEMPLATE
        self.excel_dir = self.base_dir / 'claude_generated_files'
        self.output_dir = settings.RESUMES_DIR
        self.temp_dir = settings.TEMP_LATEX_DIR

        # Create output directories
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dir.mkdir(parents=True, exist_ok=True)

        # Load template
        self.template = self._load_template()

    def _load_template(self) -> str:
        """Load the LaTeX template."""
        if not self.template_path.exists():
            raise FileNotFoundError(f"Template not found: {self.template_path}")
        with open(self.template_path, 'r', encoding='utf-8') as f:
            return f.read()

    def _get_latest_excel(self) -> Path:
        """Get the most recent Excel file from claude_generated_files."""
        # Filter out temporary files (start with ~$)
        excel_files = [f for f in self.excel_dir.glob('*.xlsx') if not f.name.startswith('~$')]
        if not excel_files:
            raise FileNotFoundError(f"No Excel files found in {self.excel_dir}")
        # Sort by modification time, get latest
        return max(excel_files, key=lambda p: p.stat().st_mtime)

    def _escape_latex(self, text: str) -> str:
        """Escape special LaTeX characters."""
        if not text or pd.isna(text):
            return ""
        text = str(text)
        # Escape special characters
        replacements = [
            ('\\', r'\textbackslash{}'),
            ('&', r'\&'),
            ('%', r'\%'),
            ('$', r'\$'),
            ('#', r'\#'),
            ('_', r'\_'),
            ('{', r'\{'),
            ('}', r'\}'),
            ('~', r'\textasciitilde{}'),
            ('^', r'\textasciicircum{}'),
        ]
        for old, new in replacements:
            text = text.replace(old, new)
        return text

    def _is_full_location(self, location: str) -> bool:
        """Check if location is fully specified (not just 'Remote')."""
        if not location or pd.isna(location):
            return False
        location = str(location).strip().lower()
        # Reject if it's just "remote" or empty
        if location in ['remote', 'remote work', 'work from home', 'wfh', '']:
            return False
        # Accept if it has city/state info
        return True

    def _clean_company_name(self, company: str) -> str:
        """Clean company name for filename."""
        if not company or pd.isna(company):
            return "Unknown"
        # Remove special characters, keep alphanumeric and spaces
        clean = re.sub(r'[^a-zA-Z0-9\s]', '', str(company))
        # Replace spaces with underscores
        clean = clean.replace(' ', '_')
        # Limit length
        return clean[:30]

    def _insert_resume_points(self, latex: str, point1: str, point2: str) -> str:
        """
        Insert resume points into the AI/ML Engineer section at Grootan.
        Inserts before the last item in the first experience section.
        """
        if not point1 and not point2:
            return latex

        # Find the first experience section (AI/ML Engineer at Grootan)
        # Look for the pattern: items followed by \resumeItemListEnd

        # The section we want to modify starts after:
        # {AI/ML Engineer}{Chennai, India}
        # {Grootan Technologies } {July 2023 – December 2023}

        # Find the position of the last \item before the first \resumeItemListEnd
        # after the AI/ML Engineer heading

        # Pattern to find the AI/ML Engineer section
        aiml_section_start = latex.find('{AI/ML Engineer}{')
        if aiml_section_start == -1:
            print("[WARNING] Could not find AI/ML Engineer section")
            return latex

        # Find the \resumeItemListEnd for this section
        section_end = latex.find(r'\resumeItemListEnd', aiml_section_start)
        if section_end == -1:
            print("[WARNING] Could not find end of AI/ML Engineer section")
            return latex

        # Get the section content
        section_content = latex[aiml_section_start:section_end]

        # Find all \item positions in this section
        item_positions = []
        pos = 0
        while True:
            pos = section_content.find(r'\item ', pos)
            if pos == -1:
                break
            item_positions.append(pos)
            pos += 1

        if len(item_positions) < 2:
            print("[WARNING] Not enough items in section to insert before last")
            return latex

        # Get the position of the last item (in the full latex string)
        last_item_rel_pos = item_positions[-1]
        last_item_abs_pos = aiml_section_start + last_item_rel_pos

        # Build the new items to insert
        new_items = ""
        if point1 and not pd.isna(point1):
            escaped_point1 = self._escape_latex(str(point1))
            new_items += f"\\item {escaped_point1}\n"
        if point2 and not pd.isna(point2):
            escaped_point2 = self._escape_latex(str(point2))
            new_items += f"    \\item {escaped_point2}\n"

        # Insert before the last item
        latex = latex[:last_item_abs_pos] + new_items + latex[last_item_abs_pos:]

        return latex

    def _update_location(self, latex: str, location: str) -> str:
        """Update the location in the header if fully specified."""
        if not self._is_full_location(location):
            return latex

        # Find and replace the location line in header
        # Original: Springfield, MO, USA (Open to Relocate)
        old_location = "Springfield, MO, USA (Open to Relocate)"

        # Format new location
        clean_location = str(location).strip()
        # Add "Open to Relocate" if it's a specific location
        new_location = f"{clean_location} (Open to Relocate)"

        latex = latex.replace(old_location, new_location)
        return latex

    def _generate_pdf(self, latex_content: str, output_name: str) -> bool:
        """Generate PDF from LaTeX content using Tectonic."""
        # Create temp .tex file
        tex_file = self.temp_dir / f"{output_name}.tex"
        with open(tex_file, 'w', encoding='utf-8') as f:
            f.write(latex_content)

        try:
            # Use tectonic - modern self-contained LaTeX engine
            result = subprocess.run(
                ['tectonic', '-o', str(self.temp_dir), str(tex_file)],
                capture_output=True,
                text=True,
                timeout=120
            )

            # Check if PDF was created
            pdf_temp = self.temp_dir / f"{output_name}.pdf"
            if pdf_temp.exists():
                # Move to output directory
                pdf_final = self.output_dir / f"{output_name}.pdf"
                shutil.move(str(pdf_temp), str(pdf_final))
                return True
            else:
                print(f"[ERROR] PDF not generated for {output_name}")
                if result.stdout:
                    # Print last 20 lines of output for debugging
                    lines = result.stdout.split('\n')[-20:]
                    print('\n'.join(lines))
                return False

        except subprocess.TimeoutExpired:
            print(f"[ERROR] pdflatex timed out for {output_name}")
            return False
        except FileNotFoundError:
            print("[ERROR] pdflatex not found. Please install LaTeX (e.g., MacTeX)")
            return False
        except Exception as e:
            print(f"[ERROR] Failed to generate PDF: {e}")
            return False

    def _cleanup_temp(self):
        """Clean up temporary LaTeX files."""
        for ext in ['aux', 'log', 'out', 'tex']:
            for f in self.temp_dir.glob(f'*.{ext}'):
                try:
                    f.unlink()
                except:
                    pass

    def generate_all_resumes(self):
        """Generate customized resumes for all jobs in the Excel file."""
        print("=" * 60)
        print("  RESUME GENERATOR")
        print("=" * 60)

        # Get latest Excel file
        excel_path = self._get_latest_excel()
        print(f"[INFO] Reading: {excel_path.name}")

        # Read Excel
        df = pd.read_excel(excel_path)
        print(f"[INFO] Found {len(df)} jobs to process")

        # Check required columns
        required_cols = ['Company Name', 'Location', 'suggested_resume_point_1', 'suggested_resume_point_2']
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            print(f"[ERROR] Missing columns: {missing}")
            print(f"[INFO] Available columns: {df.columns.tolist()}")
            return

        success_count = 0
        failed = []

        for idx, row in df.iterrows():
            company = row.get('Company Name', 'Unknown')
            location = row.get('Location', '')
            point1 = row.get('suggested_resume_point_1', '')
            point2 = row.get('suggested_resume_point_2', '')

            print(f"\n[{idx+1}/{len(df)}] Processing: {company}")

            # Start with template
            latex = self.template

            # Update location if fully specified
            if self._is_full_location(location):
                latex = self._update_location(latex, location)
                print(f"  - Location updated: {location}")

            # Insert resume points
            if point1 or point2:
                latex = self._insert_resume_points(latex, point1, point2)
                print(f"  - Added {1 if point1 else 0} + {1 if point2 else 0} resume points")

            # Generate filename
            clean_company = self._clean_company_name(company)
            filename = f"SujanDora_resume_{clean_company}"

            # Generate PDF
            if self._generate_pdf(latex, filename):
                print(f"  - Generated: {filename}.pdf")
                success_count += 1
            else:
                failed.append(company)

        # Cleanup
        self._cleanup_temp()

        # Summary
        print("\n" + "=" * 60)
        print("  SUMMARY")
        print("=" * 60)
        print(f"  Total jobs: {len(df)}")
        print(f"  Success: {success_count}")
        print(f"  Failed: {len(failed)}")
        if failed:
            print(f"  Failed companies: {', '.join(failed[:5])}{'...' if len(failed) > 5 else ''}")
        print(f"\n  Output directory: {self.output_dir}")
        print("=" * 60)


def main():
    """Main entry point."""
    generator = ResumeGenerator()
    generator.generate_all_resumes()


if __name__ == '__main__':
    main()
