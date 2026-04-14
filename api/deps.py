"""
FastAPI shared dependencies for auth-aware routes.
"""

from datetime import datetime, timedelta, timezone
import secrets

from fastapi import Cookie, Depends, Header, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from src.crud import get_user
from src.database import get_db
from src.models import User
from src.settings import settings

security = HTTPBearer(auto_error=False)


def create_access_token(user_id: int, csrf_token: str = "") -> str:
    """Create a signed access token for a user session."""
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.SESSION_EXPIRES_HOURS)
    payload = {
        "sub": str(user_id),
        "exp": expires_at,
        "csrf": csrf_token,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_session(user_id: int) -> tuple[str, str]:
    """Return a signed session token plus a CSRF token for cookie sessions."""
    csrf_token = secrets.token_urlsafe(24)
    return create_access_token(user_id, csrf_token), csrf_token


def set_session_cookies(response: Response, user_id: int) -> str:
    """Attach session and CSRF cookies to the response."""
    session_token, csrf_token = create_session(user_id)
    max_age = settings.SESSION_EXPIRES_HOURS * 60 * 60

    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=max_age,
        expires=max_age,
        path="/",
    )
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=max_age,
        expires=max_age,
        path="/",
    )
    return session_token


def clear_session_cookies(response: Response):
    """Clear the session and CSRF cookies."""
    response.delete_cookie(key=settings.SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(key=settings.CSRF_COOKIE_NAME, path="/")


def _decode_session_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def get_session_payload(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> tuple[dict, str]:
    """Resolve the auth payload from bearer auth or the session cookie."""
    token = ""
    auth_mode = "cookie"

    if credentials and credentials.credentials:
        token = credentials.credentials
        auth_mode = "bearer"
    else:
        token = request.cookies.get(settings.SESSION_COOKIE_NAME, "")

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    try:
        payload = _decode_session_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from None

    return payload, auth_mode


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    session_data: tuple[dict, str] = Depends(get_session_payload),
) -> User:
    """Resolve the authenticated user from the bearer token or session cookie."""
    payload, _auth_mode = session_data
    try:
        user_id = int(payload.get("sub", "0"))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session user") from None

    user = get_user(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session user no longer exists")
    return user


def require_csrf(
    request: Request,
    x_csrf_token: str = Header(default=""),
    csrf_cookie: str = Cookie(default="", alias=settings.CSRF_COOKIE_NAME),
    session_data: tuple[dict, str] = Depends(get_session_payload),
):
    """Validate CSRF protection for cookie-authenticated mutating requests."""
    payload, auth_mode = session_data

    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return

    if auth_mode == "bearer":
        return

    token_csrf = payload.get("csrf", "")
    if not csrf_cookie or not x_csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing CSRF token")
    if csrf_cookie != x_csrf_token or token_csrf != x_csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")


__all__ = [
    "clear_session_cookies",
    "create_access_token",
    "get_current_user",
    "get_db",
    "get_session_payload",
    "require_csrf",
    "set_session_cookies",
]
