from fastapi import Request, HTTPException, Depends
from typing import Optional
import uuid

# This is a placeholder for Supabase JWT verification.
# In production, this would use a library like `python-jose` to decode the token 
# and verify it against your Supabase JWT Secret.

def get_current_user_id(request: Request) -> uuid.UUID:
    """
    Dependency to extract user_id from JWT or request header.
    For Phase 1/2 development, we allow a 'X-User-ID' header for testing.
    """
    user_id = request.headers.get("X-User-ID")
    if not user_id:
        # Fallback for dev: allow a hardcoded ID or throw error
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        return uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid User ID format")
