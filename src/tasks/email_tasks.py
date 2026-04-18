import os
from celery import shared_task
from sqlalchemy.orm import Session
from src.database import SessionLocal
from src.models import EmailNotification
from src.tasks.celery_app import app as celery_app
from groq import Groq
import instructor
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

# Groq Client Initialization
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
client = instructor.patch(client)

class EmailExtraction(BaseModel):
    """Schema for extracting job status events from emails."""
    category: str = Field(description="Interview, Rejection, Application Received, or Other")
    summary: str = Field(description="1-sentence summary of the notification")
    is_important: bool = Field(description="True if this requires immediate user attention")

@celery_app.task(name="src.tasks.email_tasks.sync_notifications")
def sync_notifications(user_id: str):
    """
    Simulates / Implements Gmail API scanning for job updates.
    Uses Groq to classify and summarize without storing raw PII bodies.
    """
    db = SessionLocal()
    try:
        # 1. Fetch "New" emails from the last 24 hours (Mocking Gmail API Response)
        # In real implementation, this would use google-api-python-client
        mock_emails = [
            {"subject": "Interview Invitation - Google", "body": "Dear Candidate, we would like to invite you...", "sender": "recruiter@google.com", "date": datetime.utcnow()},
            {"subject": "Update on your application", "body": "Thank you for your interest, but we have decided to move forward...", "sender": "no-reply@amazon.com", "date": datetime.utcnow() - timedelta(hours=2)}
        ]

        for email in mock_emails:
            # 2. Extract intelligence via Groq
            extraction = client.chat.completions.create(
                model="llama3-70b-8192",
                response_model=EmailExtraction,
                messages=[
                    {"role": "system", "content": "You are a job application assistant. Classify the email and extract the key status update. DO NOT RETURN SENSITIVE PII."},
                    {"role": "user", "content": f"SUBJECT: {email['subject']}\nBODY: {email['body'][:500]}"} # Only pass first 500 chars to save tokens/privacy
                ]
            )

            # 3. Save to DB (Architect Rule: Do NOT store 'email['body']')
            notification = EmailNotification(
                user_id=user_id,
                subject=email['subject'],
                sender=email['sender'],
                received_at=email['date'],
                category=extraction.category,
                summary=extraction.summary,
                is_read=False
            )
            db.add(notification)
        
        db.commit()
        return {"status": "success", "notifications_count": len(mock_emails)}

    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()
