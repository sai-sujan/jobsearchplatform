"""
AI Evaluator Module
-------------------
Runs detailed AI-based resume evaluation on scraped job data.
Uses AirLLM/Ollama with a Senior Recruiter persona.
"""

import pandas as pd
from typing import List, Dict
import time
import os
from dotenv import load_dotenv
from .resume_evaluator import ResumeEvaluator, EvaluationResult
from .gemini_evaluator import GeminiFlashEvaluator
from .simple_evaluator import SimpleEvaluator

class AIEvaluator:
    """
    Orchestrates the AI evaluation process for a batch of jobs.
    """
    
    def __init__(self, resume_path: str):
        self.simple_evaluator = SimpleEvaluator() # Initialize pre-filter
        load_dotenv()
        
        # FORCE LOCAL EVALUATION (No Gemini)
        print("[INFO] Using Local Evaluator (AirLLM/Ollama) - No Cost/Quota")
        self.evaluator = ResumeEvaluator()
        self.evaluator.load_resume(resume_path)
        
    def process_jobs_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Takes a DataFrame of jobs, runs AI evaluation on each.
        """
        print(f"\n[INFO] Starting AI Evaluation for {len(df)} jobs...")
        
        # New columns to populate (Removed ATS Score as requested)
        new_columns = [
            'Missing Core Skills',
            'Missing Tools/Frameworks',
            'Missing ML/AI Concepts',
            'Resume Strengths',
            'Gaps & Improvements',
            'Suggested Resume Point 1',
            'Suggested Resume Point 2',
            'Recruiter Verdict',
            'Recruiter Verdict Reason',
            'Sponsorship Possible',
            'Sponsorship Evidence'
        ]
        
        # Initialize new columns
        for col in new_columns:
            df[col] = ""
            
        # Iterate and evaluate
        for index, row in df.iterrows():
            job_title = row.get('Job Title', 'Unknown Title')
            company = row.get('Company Name', 'Unknown Company')
            description = row.get('Job Description', '')
            
            print(f"[{index+1}/{len(df)}] Analyzing: {job_title} @ {company}...")
            
            if not description or len(str(description)) < 50:
                print(f"  -> Skipping (No Description)")
                continue
                
            # --- COST OPTIMIZATION: Run Simple Filter First ---
            passed_simple, reject_reason = self.simple_evaluator.quick_check(job_title, str(description))
            
            if not passed_simple:
                print(f"  -> [FILTERED] Skipping AI ({reject_reason})")
                df.at[index, 'Recruiter Verdict'] = "NO"
                df.at[index, 'Recruiter Verdict Reason'] = f"Auto-Rejection: {reject_reason}"
                continue
            
            # --- Continue to Local AI ---
            # Run Evaluation
            result: EvaluationResult = self.evaluator.evaluate(
                job_description=str(description),
                company_name=str(company),
                job_title=str(job_title)
            )
            
            # Populate row
            df.at[index, 'Missing Core Skills'] = ", ".join(result.missing_core_skills)
            df.at[index, 'Missing Tools/Frameworks'] = ", ".join(result.missing_tools_frameworks)
            df.at[index, 'Missing ML/AI Concepts'] = ", ".join(result.missing_ml_ai_concepts)
            df.at[index, 'Resume Strengths'] = ", ".join(result.resume_strengths)
            df.at[index, 'Gaps & Improvements'] = ", ".join(result.gaps_and_improvements)
            
            df.at[index, 'Suggested Resume Point 1'] = result.suggested_resume_point_1
            df.at[index, 'Suggested Resume Point 2'] = result.suggested_resume_point_2
            
            df.at[index, 'Recruiter Verdict'] = result.recruiter_verdict
            df.at[index, 'Recruiter Verdict Reason'] = result.recruiter_verdict_reason
            
            df.at[index, 'Sponsorship Possible'] = result.sponsorship_possible
            df.at[index, 'Sponsorship Evidence'] = result.sponsorship_evidence
            
            # No delay needed for local model
            
        print("[INFO] AI Evaluation Complete.")
        
        # Filter out REJECTED jobs (Recruiter Verdict == NO)
        print("[INFO] Filtering out rejected jobs...")
        initial_count = len(df)
        df_filtered = df[~df['Recruiter Verdict'].astype(str).str.upper().str.contains(r'\bNO\b', na=False)].copy()
        
        final_count = len(df_filtered)
        print(f"[INFO] Removed {initial_count - final_count} rejected jobs.")
        
        return df_filtered
