from typing import Optional, List, Dict
"""Authentication dependency — verifies Firebase ID tokens on every request."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import get_auth
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()


class AuthenticatedUser(BaseModel):
    """Represents a verified Firebase user extracted from the ID token."""
    uid: str
    email: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthenticatedUser:
    """Verify the Firebase ID token and return the authenticated user.

    Raises 401 if the token is invalid, expired, or missing.
    """
    token = credentials.credentials
    try:
        auth = get_auth()
        decoded = auth.verify_id_token(token)
        return AuthenticatedUser(
            uid=decoded["uid"],
            email=decoded.get("email"),
            name=decoded.get("name"),
            picture=decoded.get("picture"),
        )
    except Exception as e:
        logger.warning("Token verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
