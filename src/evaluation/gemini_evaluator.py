"""
Gemini Flash Evaluator
----------------------
Implements resume evaluation using Google's Gemini 1.5 Flash model.
Fast, cost-effective, and high-quality filtering.
"""

import os
import time
import json
import google.generativeai as genai
from typing import Dict, Optional
from .resume_evaluator import ResumeEvaluator, EvaluationResult
from .prompts import SENIOR_RECRUITER_PROMPT

class GeminiFlashEvaluator(ResumeEvaluator):
    """
    Evaluator using Google Gemini 1.5 Flash.
    """
    
    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash-lite"):
        """
        Initialize with API Key.
        """
        self.api_key = api_key
        self.model_name = model_name
        self.resume_text = ""
        
        # Configure GenAI
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(
            model_name=self.model_name,
            generation_config={"response_mime_type": "application/json"}
        )
        
    def _generate(self, prompt: str) -> str:
        """
        Generate response using Gemini API.
        """
        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            print(f"[ERROR] Gemini API Error: {e}")
            return "{}"

    def evaluate(self, job_description: str, company_name: str, job_title: str) -> EvaluationResult:
        """
        Evaluate resume against job description using Gemini.
        """
        # (Re-use the base logic but with robust error handling for API)
        result = EvaluationResult()

        if not self.resume_text:
            print("[ERROR] No resume loaded")
            return result

        try:
            print(f"[INFO] Gemini Evaluating: {job_title} @ {company_name}")

            full_jd = f"COMPANY: {company_name}\nTITLE: {job_title}\n\n{job_description}"
            
            # Prepare Prompt
            prompt = self.EVALUATION_PROMPT.format(
                resume=self.resume_text[:8000],  # Gemini handles larger context easily
                job_description=full_jd[:8000]
            )

            # Generate
            response_text = self._generate(prompt)
            result.raw_response = response_text

            # Parse
            data = self._extract_json(response_text)
            
            if not data:
                print("[WARNING] Could not parse Gemini response")
                result.recruiter_verdict_reason = "Parsing failed"
                return result

            # Populate Result
            result.ai_ats_score = int(data.get('ai_ats_score', 0))
            
            result.missing_core_skills = data.get('missing_core_skills', [])
            result.missing_tools_frameworks = data.get('missing_tools_frameworks', [])
            result.missing_ml_ai_concepts = data.get('missing_ml_ai_concepts', [])
            result.resume_strengths = data.get('resume_strengths', [])
            result.gaps_and_improvements = data.get('gaps_and_improvements', [])
            
            result.suggested_resume_point_1 = data.get('suggested_resume_point_1', '')
            result.suggested_resume_point_2 = data.get('suggested_resume_point_2', '')
            
            result.recruiter_verdict = data.get('recruiter_verdict', 'Unknown')
            result.recruiter_verdict_reason = data.get('recruiter_verdict_reason', '')
            
            result.sponsorship_possible = data.get('sponsorship_possible', 'Unknown')
            result.sponsorship_evidence = data.get('sponsorship_evidence', '')
            
            print(f"[SUCCESS] Score: {result.ai_ats_score}/100 | Verdict: {result.recruiter_verdict}")
            
            # API Rate Limit handling (free tier is generous but good practice)
            time.sleep(1) 
            
        except Exception as e:
            print(f"[ERROR] Evaluation failed: {e}")
            result.recruiter_verdict_reason = str(e)
            
        return result
