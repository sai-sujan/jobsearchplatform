"""
Centralized Configuration
-------------------------
All configurable values in one place. Reads from .env file.
Import `settings` instead of using os.getenv() directly.

Usage:
    from src.settings import settings
    print(settings.MASTER_EXCEL)
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Project root = parent of src/
BASE_DIR = Path(__file__).parent.parent.absolute()
load_dotenv(BASE_DIR / '.env')


def _getenv(key, default=''):
    """Get env var with fallback."""
    return os.getenv(key, default)


class Settings:
    """All project configuration in one place."""

    # === PATHS ===
    BASE_DIR = BASE_DIR
    DATA_DIR = BASE_DIR / 'data'
    CONFIG_DIR = BASE_DIR / 'config'
    TEMPLATES_DIR = BASE_DIR / 'templates'
    LOGS_DIR = BASE_DIR / 'logs'

    # Data files
    MASTER_EXCEL = DATA_DIR / 'jobs_master.xlsx'
    HISTORY_FILE = DATA_DIR / 'processed_jobs_history.json'
    ANALYSIS_DIR = DATA_DIR / 'analysis_results'
    JOB_DESC_DIR = DATA_DIR / 'job_descriptions'
    RESUMES_DIR = DATA_DIR / 'resumes'
    BACKUPS_DIR = DATA_DIR / 'backups'
    TEMP_LATEX_DIR = DATA_DIR / 'temp_latex'
    LOCK_FILE = DATA_DIR / '.jobs_master.lock'

    # Config files
    YOUR_SKILLS_FILE = CONFIG_DIR / 'your_skills.txt'
    COMMON_SKILLS_FILE = CONFIG_DIR / 'common_skills.txt'
    BLACKLIST_FILE = CONFIG_DIR / 'company_blacklist.txt'
    DEFAULT_TECH_STACK_FILE = CONFIG_DIR / 'default_tech_stack.json'
    JOB_CONFIG_FILE = CONFIG_DIR / 'job_config.json'

    # Templates
    LATEX_TEMPLATE = TEMPLATES_DIR / 'overleaf.txt'

    # Resume
    RESUME_PATH = _getenv(
        'RESUME_PATH',
        str(BASE_DIR / 'resume' / 'master_resume.txt')
    )

    # === BROWSER ===
    CHROME_PATH = _getenv(
        'CHROME_PATH',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    )
    CHROME_USER_DATA_DIR = _getenv('CHROME_USER_DATA_DIR', '')
    CHROME_PROFILE_DIR = _getenv('CHROME_PROFILE_DIR', 'Default')
    CHROME_PROFILE_PATH = _getenv('CHROME_PROFILE_PATH', '')
    USE_EXISTING_CHROME = _getenv('USE_EXISTING_CHROME', 'True').lower() == 'true'

    # === SEARCH QUERIES ===
    SEARCH_QUERIES = [
        (
            "AI Engineer",
            _getenv(
                'KEYWORDS_AI_ENGINEER',
                '("AI Engineer" OR "Artificial Intelligence Engineer") '
                'NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)'
            ),
            int(_getenv('JOBS_PER_QUERY', '20'))
        ),
        (
            "Machine Learning Engineer",
            _getenv(
                'KEYWORDS_ML_ENGINEER',
                '("Machine Learning Engineer" OR "ML Engineer") '
                'NOT (Senior OR Sr. OR Principal OR Staff OR Lead OR Manager)'
            ),
            int(_getenv('JOBS_PER_QUERY', '20'))
        ),
        (
            "Data Scientist",
            _getenv(
                'KEYWORDS_DATA_SCIENTIST',
                '"Data Scientist" AND ("Machine Learning" OR "Deep Learning" '
                'OR "AI" OR "Generative AI") NOT (Senior OR Sr. OR Principal '
                'OR Staff OR Lead OR Manager)'
            ),
            int(_getenv('JOBS_PER_QUERY', '20'))
        ),
    ]

    # Search parameters
    SEARCH_LOCATIONS = _getenv('SEARCH_LOCATIONS', '["United States"]')
    EXPERIENCE_LEVELS = _getenv('EXPERIENCE_LEVELS', '["Internship", "Entry level"]')
    DATE_POSTED = _getenv('DATE_POSTED', '24h')

    # === SCHEDULING ===
    SCHEDULE_INTERVAL_HOURS = int(_getenv('SCHEDULE_INTERVAL_HOURS', '3'))
    SCHEDULE_START_HOUR = int(_getenv('SCHEDULE_START_HOUR', '9'))
    SCHEDULE_END_HOUR = int(_getenv('SCHEDULE_END_HOUR', '24'))
    SCRAPE_TIMEOUT_SECONDS = int(_getenv('SCRAPE_TIMEOUT_SECONDS', '1800'))

    # === DELAYS ===
    ACTION_DELAY = float(_getenv('ACTION_DELAY', '2'))
    MIN_DELAY = float(_getenv('MIN_DELAY', '3'))
    MAX_DELAY = float(_getenv('MAX_DELAY', '7'))
    BATCH_COOLDOWN = int(_getenv('BATCH_COOLDOWN', '10'))

    # === SCORING ===
    KEYWORD_MATCH_WEIGHT = float(_getenv('KEYWORD_MATCH_WEIGHT', '0.4'))
    YOE_WEIGHT = float(_getenv('YOE_WEIGHT', '0.3'))
    EDUCATION_WEIGHT = float(_getenv('EDUCATION_WEIGHT', '0.3'))
    PREMIUM_BOOST = int(_getenv('PREMIUM_BOOST', '5'))
    TOP_JOBS_TO_KEEP = int(_getenv('TOP_JOBS_TO_KEEP', '10'))
    MAX_JOBS_TO_COLLECT = int(_getenv('MAX_JOBS_TO_COLLECT', '40'))
    MAX_BACKUPS = int(_getenv('MAX_BACKUPS', '10'))

    # === LLM CONFIGURATION ===
    EVALUATOR_TYPE = _getenv('EVALUATOR_TYPE', 'gemini')
    GEMINI_API_KEY = _getenv('GEMINI_API_KEY', '')
    AIRLLM_MODEL = _getenv('AIRLLM_MODEL', 'google/gemma-2-2b-it')
    AIRLLM_CACHE_DIR = _getenv('AIRLLM_CACHE_DIR', '~/.cache/airllm')
    OLLAMA_URL = _getenv('OLLAMA_URL', 'http://localhost:11434')
    OLLAMA_MODEL = _getenv('OLLAMA_MODEL', 'gemma3:12b')

    # === API SERVER ===
    API_HOST = _getenv('API_HOST', '0.0.0.0')
    API_PORT = int(_getenv('API_PORT', '5001'))
    CORS_ORIGINS = [
        o.strip() for o in
        _getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173,http://localhost:5174').split(',')
    ]

    # === VENV ===
    VENV_PYTHON = BASE_DIR / 'venv' / 'bin' / 'python3'

    # === EXCEL ===
    SHEET_NAME = 'All Jobs'

    def ensure_directories(self):
        """Create all required data directories."""
        for d in [self.DATA_DIR, self.ANALYSIS_DIR, self.JOB_DESC_DIR,
                  self.RESUMES_DIR, self.BACKUPS_DIR, self.TEMP_LATEX_DIR,
                  self.LOGS_DIR]:
            d.mkdir(parents=True, exist_ok=True)


# Singleton instance
settings = Settings()
