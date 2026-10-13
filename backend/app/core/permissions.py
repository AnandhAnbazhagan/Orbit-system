
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, RolePermission, EmployeePermission
from app.core.security import get_current_user


# Roles with full organization access
EXECUTIVE_ROLES = {"EXECUTIVE"}
ADMIN_ROLES = {"ADMIN"}


def has_permission(
    user: User,
    permission_code: str,
    db: Session,
) -> bool:
    """Check whether a user has the requested permission."""

    role_name = (user.role_name or "").upper()

    # Executive and admin roles have full access.
    if role_name in EXECUTIVE_ROLES | ADMIN_ROLES:
        return True

    # Check role-based permissions.
    role_permission = (
        db.query(RolePermission)
        .filter_by(
            role_name=user.role_name,
            permission_code=permission_code,
        )
        .first()
    )

    if role_permission:
        return True

    # Check employee-specific permissions.
    if user.employee_id:
        employee_permission = (
            db.query(EmployeePermission)
            .filter_by(
                employee_id=user.employee_id,
                permission_code=permission_code,
            )
            .first()
        )

        if employee_permission:
            return bool(employee_permission.allowed)

    return False


def require_permission(permission_code: str):
    """FastAPI dependency that protects an endpoint."""

    def permission_dependency(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if not has_permission(user, permission_code, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {permission_code}",
            )

        return user

    return permission_dependency
