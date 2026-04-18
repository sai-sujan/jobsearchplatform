from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List
from src.database import get_db
from src.models import EmailNotification
from pydantic import BaseModel

router = APIRouter()

@router.get("/")
def list_notifications(user_id: UUID, db: Session = Depends(get_db)):
    """Fetch user-specific notifications extracted from emails."""
    notifications = db.query(EmailNotification).filter(EmailNotification.user_id == user_id).all()
    return notifications

@router.patch("/{id}/read")
def mark_as_read(id: UUID, db: Session = Depends(get_db)):
    notification = db.query(EmailNotification).filter(EmailNotification.id == id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    db.commit()
    return {"status": "success"}
