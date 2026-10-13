import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials,
)
from passlib.context import CryptContext
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User


# ============================================================
# LOAD ENVIRONMENT VARIABLES
# File: backend/app/core/security.py
# Env:  backend/.env
# ============================================================

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_FILE, override=False)


# ============================================================
# JWT CONFIGURATION
# ============================================================

SECRET_KEY = (
    os.getenv("JWT_SECRET")
    or os.getenv("SECRET_KEY", "")
)

ALGORITHM = (
    os.getenv("JWT_ALGORITHM")
    or os.getenv("ALGORITHM")
    or "HS256"
)

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480")
)

# Reject missing or known placeholder secrets.
if (
    not SECRET_KEY
    or SECRET_KEY
    == "R6TIs30Sa-1d7yGugFxRs1V862Fb5XUxwsOZg2c3RagX_HrbvxxayqyGsRfjMuQb"
):
    raise RuntimeError(
        "A strong JWT_SECRET or SECRET_KEY must be configured "
        "in backend/.env."
    )

if ACCESS_TOKEN_EXPIRE_MINUTES <= 0:
    raise RuntimeError(
        "ACCESS_TOKEN_EXPIRE_MINUTES must be greater than zero."
    )


# ============================================================
# PASSWORD HASHING
# ============================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)


def hash_password(password: str) -> str:
    """Hash a password before saving it to the database."""

    if not password or not password.strip():
        raise ValueError("Password cannot be empty.")

    # bcrypt supports a maximum of 72 bytes.
    if len(password.encode("utf-8")) > 72:
        raise ValueError(
            "Password exceeds the bcrypt 72-byte limit."
        )

    return pwd_context.hash(password)


def verify_password(
    plain_password: str,
    password_hash: str,
) -> bool:
    """Check a plaintext password against its stored hash."""

    if not plain_password or not password_hash:
        return False

    try:
        return pwd_context.verify(
            plain_password,
            password_hash,
        )
    except (ValueError, TypeError):
        return False


# ============================================================
# HTTP BEARER AUTHENTICATION
#
# Swagger displays a single JWT access-token input.
# ============================================================

bearer_scheme = HTTPBearer(
    scheme_name="Access Token",
    description=(
        "Enter the JWT access token returned by POST /api/auth/login."
    ),
    bearerFormat="JWT",
    auto_error=True,
)


# ============================================================
# CREATE ACCESS TOKEN
# ============================================================

def create_access_token(
    subject: Any,
    expires_delta: timedelta | None = None,
    extra_claims: dict | None = None,
) -> str:
    """Create a signed JWT access token."""

    if subject is None or str(subject).strip() == "":
        raise ValueError("Token subject is required.")

    now = datetime.now(timezone.utc)

    expires = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    payload = {
        "sub": str(subject),
        "iat": now,
        "exp": expires,
    }

    # Do not allow callers to overwrite security-critical claims.
    if extra_claims:
        for key, value in extra_claims.items():
            if key not in {"sub", "iat", "exp"}:
                payload[key] = value

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


# ============================================================
# DECODE ACCESS TOKEN
# ============================================================

def decode_access_token(token: str) -> dict:
    """Decode and validate the JWT signature and expiration."""

    return jwt.decode(
        token,
        SECRET_KEY,
        algorithms=[ALGORITHM],
        options={
            "require": ["sub", "exp"],
        },
    )


# ============================================================
# GET AUTHENTICATED USER
# ============================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(
        bearer_scheme
    ),
    db: Session = Depends(get_db),
) -> User:
    """
    Validate the Bearer token and return the active user.

    Protected endpoints can use:

        user: User = Depends(get_current_user)
    """

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=(
            "Invalid or expired login session. "
            "Please log in again."
        ),
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Decode and validate the supplied JWT.
    try:
        token = credentials.credentials
        payload = decode_access_token(token)

        subject = payload.get("sub")

        if subject is None:
            raise credentials_exception

        user_id = int(subject)

        if user_id <= 0:
            raise credentials_exception

    except (
        jwt.InvalidTokenError,
        ValueError,
        TypeError,
    ):
        raise credentials_exception

    # Retrieve the user represented by the token.
    try:
        user = db.get(User, user_id)

    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to verify the authenticated user.",
        ) from exc

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account inactive.",
        )

    return user
