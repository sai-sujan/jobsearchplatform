# Job Applications Automation Package
# Modules for LinkedIn job scraping and resume evaluation

from .job_scraper import JobScraper
from .resume_evaluator import ResumeEvaluator
from .ats_scorer import ATSScorer
from .output_writer import OutputWriter

__all__ = ['JobScraper', 'ResumeEvaluator', 'ATSScorer', 'OutputWriter']
__version__ = '1.0.0'
