"""
Authentication and session endpoints for the user-facing web app.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import (
    clear_session_cookies,
    get_current_user,
    get_db,
    require_csrf,
    set_session_cookies,
)
from src.crud import authenticate_user, create_user, get_or_create_profile, get_user_by_username
from src.models import User

router = APIRouter(tags=["auth"])


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=120)
    full_name: Optional[str] = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    username: str
    password: str


def _serialize_session_user(user: User, db: Session) -> dict:
    profile = get_or_create_profile(db, user.id)
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "onboarding_completed": profile.onboarding_completed,
            "onboarding_step": profile.onboarding_step,
        }
    }


@router.post("/api/auth/signup")
@router.post("/api/v1/auth/signup")
def signup(request: SignupRequest, response: Response, db: Session = Depends(get_db)):
    """Create a user account and initialize a cookie-backed session."""
    username = request.username.strip().lower()
    if get_user_by_username(db, username):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = create_user(db, username=username, password=request.password, full_name=request.full_name)
    token = set_session_cookies(response, user.id)
    payload = _serialize_session_user(user, db)
    payload["token"] = token
    payload["auth_mode"] = "cookie-session"
    return payload


@router.post("/api/auth/login")
@router.post("/api/v1/auth/login")
def login(request: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Authenticate a user and initialize a cookie-backed session."""
    user = authenticate_user(db, request.username.strip().lower(), request.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = set_session_cookies(response, user.id)
    payload = _serialize_session_user(user, db)
    payload["token"] = token
    payload["auth_mode"] = "cookie-session"
    return payload


@router.post("/api/auth/logout", dependencies=[Depends(require_csrf)])
@router.post("/api/v1/auth/logout", dependencies=[Depends(require_csrf)])
def logout(response: Response):
    """Clear the current browser session."""
    clear_session_cookies(response)
    return {"success": True}


@router.get("/api/auth/session")
@router.get("/api/v1/auth/me")
def get_session(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the current session user and onboarding status."""
    return _serialize_session_user(user, db)
