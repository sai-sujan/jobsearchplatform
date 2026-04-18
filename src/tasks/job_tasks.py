import os
from celery import shared_task
from sqlalchemy.orm import Session
from src.database import SessionLocal
from src.models import Job, MatchedJob, UserProfile
from src.tasks.celery_app import app as celery_app
import instructor
from groq import Groq
from pydantic import BaseModel, Field
from typing import List

# Groq Client Initialization
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
client = instructor.patch(client)

class JobMatchEvaluation(BaseModel):
    """Schema for AI evaluation result via Groq."""
    fit_score: float = Field(description="Score from 0-100 indicating match quality")
    confidence: str = Field(description="Low, Medium, or High confidence in the match")
    summary: str = Field(description="2-sentence summary of why this job matches the user")
    match_reasons: List[str] = Field(description="Top 3 technical reasons for the match")
    tailored_points: List[str] = Field(description="3 tailored bullet points for the user's resume for this job")

@celery_app.task(name="src.tasks.job_tasks.process_ai_evaluation")
def process_ai_evaluation(job_id: str, user_id: str):
    """
    Background task to evaluate a job against a user's resume using Groq.
    """
    db = SessionLocal()
    try:
        # 1. Fetch Data
        job = db.query(Job).filter(Job.id == job_id).first()
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        match = db.query(MatchedJob).filter(MatchedJob.job_id == job_id, MatchedJob.user_id == user_id).first()
        
        if not (job and profile and match):
            return {"status": "error", "message": "Missing required entities"}

        # 2. LLM Inference via Groq/Instructor
        evaluation = client.chat.completions.create(
            model="llama3-70b-8192",
            response_model=JobMatchEvaluation,
            messages=[
                {"role": "system", "content": "You are a professional technical recruiter. Evaluate the job match and provide tailored resume points."},
                {"role": "user", "content": f"USER RESUME: {profile.resume_raw_text}\n\nJOB DESCRIPTION: {job.job_description}"}
            ]
        )

        # 3. Update Database
        match.ai_match_score = evaluation.fit_score
        match.ai_match_confidence = evaluation.confidence
        match.ai_match_summary = evaluation.summary
        match.ai_match_reasons = evaluation.match_reasons
        # store tailored points in a json field or similar
        match.workspace_analysis = {"tailored_points": evaluation.tailored_points}
        
        db.commit()
        return {"status": "success", "job_id": job_id}
        
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()
