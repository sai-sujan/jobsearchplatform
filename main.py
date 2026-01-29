#!/usr/bin/env python3
"""
Job Applications Automation - Main Entry Point
================================================
Automates LinkedIn job searching and resume evaluation using Playwright and AirLLM.
Supports Premium job detection and prioritization.

Commands:
    /search_jobs - Run full job search and evaluation workflow

Usage:
    python main.py

Requirements:
    - Chrome with LinkedIn logged in
    - AirLLM with a model (e.g., google/gemma-2-2b-it) OR Ollama as fallback
    - Master resume in resume/master_resume.txt
"""

import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from src.job_scraper import JobScraper, JobListing
from src.resume_evaluator import ResumeEvaluator
from src.ats_scorer import ATSScorer
from src.output_writer import OutputWriter


class JobSearchAutomation:
    """
    Main automation class that orchestrates the job search workflow.
    Uses AirLLM for local inference with Ollama fallback.
    """

    def __init__(self):
        """Initialize the automation with configuration from .env"""
        # Load environment variables
        load_dotenv()

        # Configuration
        self.browser = os.getenv('BROWSER', 'chrome')
        self.chrome_path = os.getenv(
            'CHROME_PATH',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        )
        self.chrome_profile_path = os.getenv('CHROME_PROFILE_PATH', '')

        # AirLLM configuration (local LLM for M2 Mac)
        self.airllm_model = os.getenv('AIRLLM_MODEL', 'google/gemma-2-2b-it')
        self.airllm_cache_dir = os.getenv('AIRLLM_CACHE_DIR', '~/.cache/airllm')

        # Ollama configuration (fallback)
        self.ollama_model = os.getenv('OLLAMA_MODEL', 'gemma3:12b')
        self.ollama_url = os.getenv('OLLAMA_URL', 'http://localhost:11434')

        # Search configuration defaults
        self.default_delay = float(os.getenv('ACTION_DELAY', '2'))
        self.premium_boost = int(os.getenv('PREMIUM_BOOST', '5'))
        self.top_n = int(os.getenv('TOP_JOBS_TO_KEEP', '10'))

        # Paths
        self.base_dir = Path(__file__).parent
        self.resume_path = self.base_dir / 'resume' / 'master_resume.txt'
        self.blacklist_path = self.base_dir / 'config' / 'company_blacklist.txt'
        self.job_desc_dir = self.base_dir / 'job_descriptions'
        
        # Ensure base directories exist
        self.job_desc_dir.mkdir(parents=True, exist_ok=True)

        # Initialize components (lazy load)
        self.scraper = None
        self.evaluator = None


    def validate_configuration(self) -> bool:
        """Validate that all required configuration is present."""
        errors = []

        if not self.chrome_profile_path:
            errors.append("CHROME_PROFILE_PATH not set in .env")

        if not self.resume_path.exists():
            errors.append(f"Resume not found at: {self.resume_path}")

        if not os.path.exists(self.chrome_path):
            errors.append(f"Chrome not found at: {self.chrome_path}")

        # Check if AirLLM or Ollama is available
        airllm_available = False
        ollama_available = False

        # Check AirLLM
        try:
            import torch
            import airllm
            airllm_available = True
            print(f"[INFO] AirLLM available with model: {self.airllm_model}")
        except ImportError:
            print("[WARNING] AirLLM not installed. Will try Ollama fallback.")

        # Check Ollama (fallback)
        try:
            response = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            if response.status_code == 200:
                ollama_available = True
                models = [m['name'] for m in response.json().get('models', [])]
                if any(self.ollama_model in m for m in models):
                    print(f"[INFO] Ollama available with model: {self.ollama_model}")
                else:
                    print(f"[WARNING] Ollama running but model {self.ollama_model} not found")
        except requests.exceptions.ConnectionError:
            pass
        except Exception as e:
            pass

        if not airllm_available and not ollama_available:
            errors.append("Neither AirLLM nor Ollama is available. Install AirLLM or run: ollama serve")

        if errors:
            print("\n[ERROR] Configuration errors:")
            for error in errors:
                print(f"  - {error}")
            print("\nPlease fix the errors and try again.")
            return False

        print("[INFO] Configuration validated successfully")
        return True

    def initialize_components(self, max_jobs: int = 40):
        """Initialize all automation components if not already initialized."""
        if self.scraper and self.evaluator:
            return

        print("\n[INFO] Initializing components...")

        # Job Scraper
        self.scraper = JobScraper(
            chrome_path=self.chrome_path,
            chrome_profile_path=self.chrome_profile_path,
            blacklist_path=str(self.blacklist_path),
            action_delay=self.default_delay,
            max_jobs=max_jobs
        )

        # Resume Evaluator (DISABLED for Fast Mode)
        # self.evaluator = ResumeEvaluator(
        #     model=self.airllm_model,
        #     ollama_url=self.ollama_url,
        #     ollama_model=self.ollama_model,
        #     cache_dir=self.airllm_cache_dir
        # )
        # self.evaluator.load_resume(str(self.resume_path))
        pass

        print("[INFO] Core components initialized")

    def save_job_description(self, job: JobListing, index: int):
        """Save job description to file for reference."""
        try:
            # Create filename
            safe_company = "".join(c for c in job.company_name if c.isalnum() or c in ' -_')[:30]
            safe_title = "".join(c for c in job.job_title if c.isalnum() or c in ' -_')[:30]
            filename = f"{index:02d}_{safe_company}_{safe_title}.txt"
            filepath = self.job_desc_dir / filename

            premium_tag = " [PREMIUM]" if job.is_premium else ""
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(f"Company: {job.company_name}\n")
                f.write(f"Title: {job.job_title}{premium_tag}\n")
                f.write(f"Link: {job.job_link}\n")
                f.write(f"Posted: {job.posting_date}\n")
                f.write(f"Location: {job.location}\n")
                if job.is_premium:
                    f.write(f"Premium Indicators: {job.premium_indicators}\n")
                f.write("\n" + "=" * 60 + "\n\n")
                f.write(job.job_description)

        except Exception as e:
            print(f"[WARNING] Could not save job description: {e}")

    def run_batch(self, role_name: str, search_keywords: str, job_count: int):
        """
        Run a single batch of job search and evaluation.
        
        Args:
            role_name: Name of the role (e.g., "AI Engineer") - used for folders
            search_keywords: Keywords to search for
            job_count: Number of jobs to collect
        """
        print("\n" + "=" * 70)
        print(f"  BATCH: {role_name}")
        print("=" * 70)
        print(f"  Keywords: {search_keywords}")
        print(f"  Target: Collect {job_count} jobs")
        print("=" * 70 + "\n")

        # Create output directory for this batch
        safe_role_name = role_name.replace(" ", "_").lower()
        batch_output_dir = self.base_dir / 'outputs' / safe_role_name
        batch_output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create output filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = batch_output_dir / f"{safe_role_name}_jobs_{timestamp}.xlsx"
        
        # Initialize Scorer and Writer for this batch
        scorer = ATSScorer(top_n=job_count, premium_boost=self.premium_boost)  # Keep all jobs in batch
        writer = OutputWriter(str(output_file))
        
        # Update scraper max jobs
        if self.scraper:
            self.scraper.max_jobs = job_count
        else:
            self.initialize_components(max_jobs=job_count)
            
        try:
            # Step 1: Collect jobs
            print(f"\n[INFO] starting search for {role_name}...")
            jobs = self.scraper.search_and_collect(search_keywords)
            
            if not jobs:
                print(f"[WARNING] No jobs found for {role_name}")
                return

            print(f"\n[INFO] Filtering {len(jobs)} jobs (No AI)...")
            
            # Simple Filter & Scoring (No AI)
            from src.simple_evaluator import SimpleEvaluator
            simple_eval = SimpleEvaluator()
            
            for i, job in enumerate(jobs, 1):
                # Save description
                self.save_job_description(job, i)
                
                # Check Simple Filters
                passed, reason = simple_eval.quick_check(job.job_title, job.job_description)
                
                # Create a mock result for the output writer
                # The output writer expects a 'ScoredJob' object
                from src.resume_evaluator import EvaluationResult
                mock_result = EvaluationResult()
                
                if passed:
                    mock_result.recruiter_verdict = "YES"
                    mock_result.recruiter_verdict_reason = "Passed Keyword Filters"
                else:
                    mock_result.recruiter_verdict = "NO"
                    mock_result.recruiter_verdict_reason = f"Auto-Rejection: {reason}"
                    
                mock_result.missing_core_skills = ["AI Evaluator Disabled"]
                
                scorer.add_job(job, mock_result)
                
            # Step 3: Save Output
            scored_jobs = scorer.get_top_jobs() # Get all ranked jobs
            # Filter out NOs if desired, or keep them to show what was rejected
            # User previously wanted filtered list.
            final_jobs = [j for j in scored_jobs if j.evaluation.recruiter_verdict == "YES"]
            
            print(f"[INFO] kept {len(final_jobs)} jobs after regex filter.")
            
            if final_jobs:
                writer.write_excel(final_jobs)
                stats = scorer.get_statistics() # Might be empty/basic
                writer.write_summary_sheet(final_jobs, stats)
                print(f"\n[SUCCESS] Batch {role_name} complete. Saved to: {output_file}")
            else:
                print(f"[WARNING] No jobs passed keywords filter.")
            
        except Exception as e:
            print(f"[ERROR] Batch {role_name} failed: {e}")
            import traceback
            traceback.print_exc()

    def run_all_batches(self):
        """Run all configured batches."""
        if not self.validate_configuration():
            return
            
        # Define batches
        batches = [
            ("AI Engineer", "AI Engineer OR Artificial Intelligence Engineer", 20),
            ("Machine Learning Engineer", "Machine Learning Engineer OR ML Engineer", 5),
            ("Data Scientist", "Data Scientist", 5)
        ]
        
        try:
            for role_name, keywords, count in batches:
                # Add "Entry level" implicitly via scraper, but keywords are focused
                self.run_batch(role_name, keywords, count)
                time.sleep(5) # Cooldown between batches
                
        finally:
            if self.scraper:
                self.scraper.close_browser()


def print_help():
    """Print help information."""
    print("""
Job Applications Automation (AirLLM Edition)
============================================

Commands:
    /search_jobs  - Run full job search and evaluation workflow
    /help         - Show this help message
    /status       - Check configuration status

Quick Start:
    1. Install dependencies: pip install -r requirements.txt
    2. Install Playwright: playwright install chromium
    3. Configure .env with CHROME_PROFILE_PATH
    4. Update resume/master_resume.txt with your resume
    5. Run: python main.py

The automation will:
    - Open Chrome with your LinkedIn session
    - Search for ML/AI jobs with filters (Entry-level, Internship, Remote, Past week)
    - Collect 40 job listings (Premium jobs detected automatically)
    - Filter out staffing/consulting companies
    - Evaluate your resume against each job using AirLLM (with Ollama fallback)
    - Rank jobs with Premium boost (+5 points for Premium/Featured jobs)
    - Keep top 10 jobs
    - Save results to outputs/job_evaluations.xlsx

LLM Options:
    - Primary: AirLLM with google/gemma-2-2b-it (optimized for M2 Mac)
    - Fallback: Ollama with gemma3:12b
""")


def check_status():
    """Check configuration status."""
    print("\nConfiguration Status")
    print("=" * 50)

    load_dotenv()

    # Check .env
    base_dir = Path(__file__).parent
    env_path = base_dir / '.env'
    env_exists = env_path.exists()
    print(f"{'✓' if env_exists else '✗'} .env file exists")

    if env_exists:
        # Check required values
        chrome_path = os.getenv('CHROME_PATH', '')
        chrome_profile = os.getenv('CHROME_PROFILE_PATH', '')
        airllm_model = os.getenv('AIRLLM_MODEL', 'google/gemma-2-2b-it')
        ollama_model = os.getenv('OLLAMA_MODEL', 'gemma3:12b')
        top_n = os.getenv('TOP_JOBS_TO_KEEP', '10')
        premium_boost = os.getenv('PREMIUM_BOOST', '5')

        print(f"{'✓' if chrome_path else '✗'} CHROME_PATH: {chrome_path[:50] + '...' if len(chrome_path) > 50 else chrome_path or 'Using default'}")
        print(f"{'✓' if chrome_profile else '✗'} CHROME_PROFILE_PATH: {chrome_profile[:40] + '...' if len(chrome_profile) > 40 else chrome_profile or 'Not set'}")
        print(f"  AIRLLM_MODEL: {airllm_model}")
        print(f"  OLLAMA_MODEL: {ollama_model}")
        print(f"  TOP_JOBS_TO_KEEP: {top_n}")
        print(f"  PREMIUM_BOOST: +{premium_boost}")

    # Check AirLLM
    try:
        import torch
        import airllm
        print("✓ AirLLM installed")
        if torch.backends.mps.is_available():
            print("  └─ Apple MPS acceleration available")
    except ImportError:
        print("✗ AirLLM not installed (pip install airllm)")

    # Check Ollama
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=3)
        if response.status_code == 200:
            models = [m['name'] for m in response.json().get('models', [])]
            print(f"✓ Ollama running with {len(models)} models")
        else:
            print("✗ Ollama not responding")
    except:
        print("✗ Ollama not running (run: ollama serve)")

    # Check resume
    resume_path = base_dir / 'resume' / 'master_resume.txt'
    resume_exists = resume_path.exists()
    print(f"{'✓' if resume_exists else '✗'} Resume file exists")

    # Check Chrome
    chrome_default = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    chrome_exists = os.path.exists(chrome_default)
    print(f"{'✓' if chrome_exists else '✗'} Chrome installed")

    # Check chrome_session directory
    session_dir = base_dir / 'chrome_session'
    session_exists = session_dir.exists()
    print(f"{'✓' if session_exists else '✗'} Chrome session directory exists")

    print("=" * 50)


def main():
    """Main entry point with command handling."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Job Search Automation')
    parser.add_argument('--role', type=str, help='Role name (e.g., "AI Engineer")')
    parser.add_argument('--keywords', type=str, help='Search keywords')
    parser.add_argument('--count', type=int, help='Number of jobs to collect')
    
    args = parser.parse_args()
    
    print("""
╔════════════════════════════════════════════════════════════════════╗
║         JOB APPLICATIONS AUTOMATION - Clawdbot Edition             ║
║         LinkedIn Job Search + AI Resume Evaluation                 ║
║         Premium Job Detection + AirLLM Integration                 ║
╚════════════════════════════════════════════════════════════════════╝
    """)

    if args.role and args.keywords and args.count:
        # Run single batch
        automation = JobSearchAutomation()
        automation.run_batch(args.role, args.keywords, args.count)
    else:
        # Interactive / Legacy mode check
        if len(sys.argv) > 1 and sys.argv[1].startswith('/'):
            command = sys.argv[1].lower()
            if command in ['/help', 'help', '-h', '--help']:
                print_help()
            elif command in ['/status', 'status']:
                check_status()
            elif command in ['/search_jobs', 'search_jobs', 'search']:
                print("[ERROR] Please use run_automation.py or provide --role, --keywords, --count args")
        else:
            print("[INFO] No arguments provided. Use --help or run run_automation.py")
            print_help()


if __name__ == '__main__':
    main()
