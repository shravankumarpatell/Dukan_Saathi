from typing import Optional, List, Dict
"""Firebase Admin SDK initialization — Firestore + Auth."""

import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth
from app.config import settings
import logging
import os

logger = logging.getLogger(__name__)

_app = None
_db = None


def init_firebase():
    """Initialize Firebase Admin SDK. Must be called once at startup."""
    global _app, _db

    if _app is not None:
        return

    cred_path = settings.FIREBASE_CREDENTIALS_PATH
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        _app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin initialized with service account: %s", cred_path)
    else:
        # Fall back to Application Default Credentials (e.g. on GCP)
        _app = firebase_admin.initialize_app()
        logger.info("Firebase Admin initialized with default credentials")

    _db = firestore.client()


def get_db() -> firestore.firestore.Client:
    """Return the Firestore client. Raises if not initialized."""
    if _db is None:
        raise RuntimeError("Firebase not initialized. Call init_firebase() first.")
    return _db


def get_auth():
    """Return firebase_admin.auth module for token verification."""
    return firebase_auth
