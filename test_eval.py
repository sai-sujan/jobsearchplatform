
import sys
import os
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from src.resume_evaluator import ResumeEvaluator

def test():
    print("Initializing Evaluator...")
    evaluator = ResumeEvaluator(
        model_name="google/gemma-2-2b-it",
        ollama_model="gemma3:12b"
    )
    
    resume_path = "resume/master_resume.txt"
    if not evaluator.load_resume(resume_path):
        print("Failed to load resume")
        return

    # Dummy job description
    jd = """
    Software Engineer
    
    We are looking for a Software Engineer to join our team.
    
    Responsibilities:
    - Build web applications using Python and React
    - Design RESTful APIs
    - Work with SQL databases
    
    Requirements:
    - 0-2 years of experience
    - Proficiency in Python
    - Experience with React is a plus
    - Knowledge of SQL
    - Bachelor's degree in Computer Science
    
    Benefits:
    - Competitive salary
    - Remote work
    """
    
    print("\nRunning evaluation...")
    result = evaluator.evaluate(jd, "Test Company", "Software Engineer")
    
    print("\n--- RESULTS ---")
    print(f"ATS Score: {result.ats_score}")
    print(f"Justification: {result.score_justification}")
    print(f"Missing Skills: {result.missing_core_skills}")
    print(f"Recruiter Verdict: {result.recruiter_verdict}")
    print(f"Raw Response Length: {len(result.raw_response)}")
    if result.ats_score == 0:
        print(f"Raw Response Preview:\n{result.raw_response[:500]}")

if __name__ == "__main__":
    test()
