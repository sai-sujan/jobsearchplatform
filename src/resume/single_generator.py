#!/usr/bin/env python3
"""
Single Resume Generator - Generates one customized resume from a JSON file.
Works with the single-column tabular LaTeX template (Overleaf format).
"""

import json
import subprocess
import re
import sys
from pathlib import Path

# Support both module invocation (python -m src.resume.single_generator)
# and direct script invocation (python src/resume/single_generator.py)
try:
    from ..settings import settings
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
    from src.settings import settings


class SingleResumeGenerator:
    def __init__(self):
        self.base_dir = settings.BASE_DIR
        self.template_path = settings.LATEX_TEMPLATE
        self.resumes_dir = settings.RESUMES_DIR
        self.resumes_dir.mkdir(exist_ok=True)

    def _read_template(self) -> str:
        """Read the LaTeX template."""
        with open(self.template_path, 'r', encoding='utf-8') as f:
            return f.read()

    def _read_json(self, json_path: str) -> dict:
        """Read the JSON configuration file."""
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _escape_latex(self, text: str) -> str:
        """Escape special LaTeX characters (but NOT backslashes for \\\\item)."""
        if not isinstance(text, str):
            return str(text)

        # Sanitize Unicode characters
        replacements = {
            '–': '--', '—': '---',
            '"': "``", '"': "''",
            ''': "'", ''': "'",
            '…': '...',
            '~': r'\textasciitilde{}',
        }
        for old, new in replacements.items():
            text = text.replace(old, new)

        # Escape & but not if already escaped
        text = re.sub(r'(?<!\\)&', r'\\&', text)
        # Escape % but not if already escaped
        text = re.sub(r'(?<!\\)%', r'\\%', text)
        # Escape _ but not if already escaped
        text = re.sub(r'(?<!\\)_', r'\\_', text)
        # Escape $ but not if already escaped
        text = re.sub(r'(?<!\\)\$', r'\\$', text)
        # Escape # but not if already escaped
        text = re.sub(r'(?<!\\)#', r'\\#', text)

        return text

    def _update_location(self, content: str, location: str) -> str:
        """Update the location in the centered header contact line."""
        # Template has: Springfield, MO, USA (Open to Relocate)
        # We want to replace just the city/state part, keeping "(Open to Relocate)"
        clean_location = location.strip()

        # Remove variations of "open to relocate" from the input
        clean_location = re.sub(r'\s*\(?\s*open\s+to\s+relocat(e|ion)\s*\)?\s*', '', clean_location, flags=re.IGNORECASE)
        clean_location = re.sub(r'[,\-]\s*$', '', clean_location).strip()

        # Replace the location in the header (keeps "Open to Relocate" suffix)
        pattern = r'Springfield, MO, USA (\(Open to Relocate\))'
        replacement = f'{clean_location} \\1'
        return re.sub(pattern, replacement, content)

    def _update_tech_stack(self, content: str, tech_stack: dict) -> str:
        """Update the Technical Skills tabular section with new rows."""
        # Build new tabular rows from the tech_stack dict
        rows = []
        for category, skills in tech_stack.items():
            if skills:
                escaped_category = self._escape_latex(category)
                escaped_skills = ', '.join([self._escape_latex(s) for s in skills])
                rows.append(f"\\textbf{{{escaped_category}}} & {escaped_skills} \\\\")

        new_rows = "\n".join(rows)

        # Pattern matches the tabular content between \begin{tabular} and \end{tabular}
        # in the Technical Skills section
        pattern = (
            r'(\\begin\{tabular\}\{@\{\}p\{4\.9cm\} p\{13cm\}@\{\}\}\s*)'
            r'(.*?)'
            r'(\\end\{tabular\})'
        )

        def replacer(match):
            return match.group(1) + new_rows + "\n" + match.group(3)

        return re.sub(pattern, replacer, content, flags=re.DOTALL)

    def _update_experience_points(self, content: str, points: list) -> str:
        """Update the AI/ML Engineer experience bullet points."""
        # Pattern to match the first resumeSubheading for AI/ML Engineer
        # followed by its resumeItemListStart...resumeItemListEnd block
        pattern = (
            r'(\\resumeSubheading\s*'
            r'\{AI/ML Engineer\}.*?'
            r'\\resumeItemListStart\s*)'
            r'(.*?)'
            r'(\\resumeItemListEnd)'
        )

        # Process points - handle both with and without \item prefix
        processed_points = []
        for p in points:
            p = p.strip()
            # Remove \item if present
            if p.startswith('\\item'):
                p = p[5:].strip()
            # Escape special LaTeX characters (%, &, etc.)
            p = self._escape_latex(p)
            processed_points.append(f"\\item {p}")

        new_points = "\n".join(processed_points)

        def replacer(match):
            return match.group(1) + "\n" + new_points + "\n" + match.group(3)

        # Only replace the FIRST match (AI/ML Engineer, not Intern)
        return re.sub(pattern, replacer, content, count=1, flags=re.DOTALL)

    def _generate_pdf(self, latex_content: str, output_name: str) -> bool:
        """Generate PDF from LaTeX content using Tectonic."""
        temp_dir = self.base_dir / "temp_latex"
        temp_dir.mkdir(exist_ok=True)

        tex_file = temp_dir / f"{output_name}.tex"

        with open(tex_file, 'w', encoding='utf-8') as f:
            f.write(latex_content)

        try:
            result = subprocess.run(
                ['tectonic', '-o', str(temp_dir), str(tex_file)],
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode == 0:
                pdf_source = temp_dir / f"{output_name}.pdf"
                pdf_dest = self.resumes_dir / f"{output_name}.pdf"

                if pdf_source.exists():
                    import shutil
                    shutil.move(str(pdf_source), str(pdf_dest))
                    print(f"Generated: {pdf_dest}")
                    return True
                else:
                    print("Error: PDF not created")
                    return False
            else:
                print(f"Tectonic error:\n{result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            print("Error: Compilation timed out")
            return False
        except Exception as e:
            print(f"Error: {e}")
            return False
        finally:
            if tex_file.exists():
                tex_file.unlink()

    def generate(self, json_path: str, company_name: str = None) -> bool:
        """Generate a single customized resume."""
        config = self._read_json(json_path)

        # Use meta_company from JSON if company_name not provided
        if not company_name and 'meta_company' in config:
            company_name = config['meta_company']
        elif not company_name:
            company_name = "Unknown"

        print(f"\n{'='*60}")
        print(f"Generating resume for: {company_name}")
        print(f"Using JSON: {json_path}")
        if 'meta_job_title' in config:
            print(f"Job Title: {config['meta_job_title']}")
        print(f"{'='*60}\n")

        content = self._read_template()

        # Apply customizations
        if 'location' in config:
            content = self._update_location(content, config['location'])
            print(f"Updated location: {config['location']}")

        if 'tech_stack' in config:
            content = self._update_tech_stack(content, config['tech_stack'])
            print(f"Updated tech stack with {len(config['tech_stack'])} categories")

        if 'points' in config:
            content = self._update_experience_points(content, config['points'])
            print(f"Updated experience with {len(config['points'])} bullet points")

        # Generate PDF
        safe_company = re.sub(r'[^\w\s-]', '', company_name).replace(' ', '_')
        output_name = f"SujanDora_resume_{safe_company}"

        success = self._generate_pdf(content, output_name)

        if success:
            print(f"\nResume saved to: resumes/{output_name}.pdf")

        return success


def main():
    if len(sys.argv) < 2:
        print("Usage: python single_resume_generator.py <json_file> [company_name]")
        print("\nExample:")
        print("  python single_resume_generator.py samsung_config.json")
        print("  python single_resume_generator.py job_config.json 'Google'")
        sys.exit(1)

    json_path = sys.argv[1]
    company_name = sys.argv[2] if len(sys.argv) > 2 else None

    if not Path(json_path).exists():
        print(f"Error: JSON file not found: {json_path}")
        sys.exit(1)

    generator = SingleResumeGenerator()
    success = generator.generate(json_path, company_name)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
