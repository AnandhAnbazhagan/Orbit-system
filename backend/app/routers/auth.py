
import logging
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.employee import Employee
from ..core.security import (
    verify_password,
    create_access_token,
    get_current_user,
)

logger = logging.getLogger("orbit.auth")

router = APIRouter(
    prefix="/api/auth",
    tags=["Auth"],
)


# ============================================================
# REQUEST / RESPONSE SCHEMAS
# ============================================================

class LoginRequest(BaseModel):
    """JSON request body for login."""

    email: EmailStr
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    """Successful login response."""

    access_token: str
    token_type: str = "bearer"


# ============================================================
# HELPERS
# ============================================================

def serialize_date(value: Any) -> str | None:
    """Convert date/datetime values to ISO strings."""

    if value is None:
        return None

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    return str(value)


# ============================================================
# LOGIN - NORMAL JSON REQUEST
# ============================================================

@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Login",
    description="Log in with an email address and password using JSON.",
)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    """
    Expected JSON request:

    {
        "email": "admin@example.com",
        "password": "your-password"
    }

    Returns an access token when authentication succeeds.
    """

    email = str(data.email).strip().lower()

    # Find the user account.
    try:
        user = (
            db.query(User)
            .filter(func.lower(User.email) == email)
            .first()
        )

    except SQLAlchemyError as exc:
        logger.exception("Database lookup failed during login")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to access the login database.",
        ) from exc

    # Use the same message for unknown emails and incorrect passwords.
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify the stored password hash.
    try:
        password_valid = verify_password(
            data.password,
            user.password_hash,
        )

    except Exception as exc:
        logger.exception("Password verification failed")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password verification failed. Check backend logs.",
        ) from exc

    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Prevent inactive accounts from signing in.
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account inactive.",
        )

    # Generate the JWT using the existing security module.
    try:
        token = create_access_token(user.id)

    except Exception as exc:
        logger.exception("JWT token creation failed")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create login token.",
        ) from exc

    return LoginResponse(
        access_token=token,
        token_type="bearer",
    )


# ============================================================
# LOGOUT
# ============================================================

@router.post(
    "/logout",
    summary="Logout",
)
def logout():
    """
    Client-side JWT logout.

    The frontend should remove the stored access token.
    Server-side token revocation requires a token blacklist
    or another revocation mechanism.
    """

    return {
        "success": True,
        "message": "Logout recorded; discard the token on the client.",
    }


# ============================================================
# CURRENT USER PROFILE
# ============================================================

@router.get(
    "/me",
    summary="Get current user",
)
def me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's account and employee profile."""

    employee = None

    # First, use the linked employee ID.
    if user.employee_id:
        employee = db.get(Employee, user.employee_id)

    # Fall back to the employee email if no linked record was found.
    if employee is None and user.email:
        employee = (
            db.query(Employee)
            .filter(
                func.lower(Employee.email)
                == user.email.strip().lower()
            )
            .first()
        )

    employee_data = None

    if employee is not None:
        first_name = employee.first_name or ""
        last_name = employee.last_name or ""

        employee_data = {
            "id": employee.id,
            "employee_id": employee.employee_id,
            "first_name": first_name,
            "last_name": last_name,
            "name": f"{first_name} {last_name}".strip(),
            "email": employee.email,
            "phone": employee.phone,
            "department": employee.department,
            "designation": employee.designation,
            "joining_date": serialize_date(employee.joining_date),
            "employment_type": employee.employment_type,
            "status": employee.status,
            "profile_image": employee.profile_image,
            "reporting_manager_id": employee.reporting_manager_id,
        }

    return {
        "id": user.id,
        "email": user.email,
        "role": user.role_name,
        "is_active": user.is_active,
        "employee": employee_data,

        # Employee details are also available at the top level.
        "employee_id": (
            employee_data["employee_id"] if employee_data else None
        ),
        "first_name": (
            employee_data["first_name"] if employee_data else None
        ),
        "last_name": (
            employee_data["last_name"] if employee_data else None
        ),
        "phone": (
            employee_data["phone"] if employee_data else None
        ),
        "department": (
            employee_data["department"] if employee_data else None
        ),
        "designation": (
            employee_data["designation"] if employee_data else None
        ),
        "joining_date": (
            employee_data["joining_date"] if employee_data else None
        ),
        "employment_type": (
            employee_data["employment_type"] if employee_data else None
        ),
        "status": (
            employee_data["status"] if employee_data else None
        ),
    }
