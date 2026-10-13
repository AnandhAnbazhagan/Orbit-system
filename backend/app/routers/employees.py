
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeAccountUpdate,
)
from app.core.security import hash_password
from app.core.permissions import require_permission


router = APIRouter(
    prefix="/api/employees",
    tags=["Employees"],
)


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class EmployeeAccessUpdate(BaseModel):
    role_name: str


class EmployeeActionRequest(BaseModel):
    action: str


# ============================================================
# HELPERS
# ============================================================

VALID_ROLES = {
    "EXECUTIVE",
    "ADMIN",
    "MANAGER",
    "EMPLOYEE",
}

VALID_STATUSES = {
    "ACTIVE",
    "INACTIVE",
}


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_role(role_name: str) -> str:
    role = role_name.strip().upper()

    # CEO and DIRECTOR share the internal EXECUTIVE role.
    if role in {"CEO", "DIRECTOR"}:
        return "EXECUTIVE"

    if role not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role: {role_name}",
        )

    return role


def get_employee_or_404(
    db: Session,
    employee_id: int,
) -> Employee:
    employee = (
        db.query(Employee)
        .filter(Employee.id == employee_id)
        .first()
    )

    if employee is None:
        raise HTTPException(
            status_code=404,
            detail="Employee not found.",
        )

    return employee


def get_user_for_employee(
    db: Session,
    employee: Employee,
) -> User:
    user = (
        db.query(User)
        .filter(User.employee_id == employee.id)
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="Login account not found for this employee.",
        )

    return user


def ensure_email_available(
    db: Session,
    email: str,
    employee_id: Optional[int] = None,
    user_id: Optional[int] = None,
) -> None:
    employee_query = db.query(Employee).filter(
        Employee.email == email
    )

    if employee_id is not None:
        employee_query = employee_query.filter(
            Employee.id != employee_id
        )

    if employee_query.first():
        raise HTTPException(
            status_code=409,
            detail="This email is already assigned to another employee.",
        )

    user_query = db.query(User).filter(User.email == email)

    if user_id is not None:
        user_query = user_query.filter(User.id != user_id)

    if user_query.first():
        raise HTTPException(
            status_code=409,
            detail="This email is already used by another account.",
        )


def employee_to_dict(
    employee: Employee,
    role_name: Optional[str] = None,
) -> dict:
    return {
        "id": employee.id,
        "employee_id": employee.employee_id,
        "first_name": employee.first_name,
        "last_name": employee.last_name,
        "email": employee.email,
        "phone": employee.phone,
        "department": employee.department,
        "designation": employee.designation,
        "joining_date": employee.joining_date,
        "reporting_manager_id": employee.reporting_manager_id,
        "employment_type": employee.employment_type,
        "profile_image": getattr(
            employee, "profile_image", None
        ),
        "status": employee.status,
        "role_name": role_name or "EMPLOYEE",
    }


def get_employee_role(
    db: Session,
    employee: Employee,
) -> str:
    user = (
        db.query(User)
        .filter(User.employee_id == employee.id)
        .first()
    )

    return user.role_name if user else "EMPLOYEE"


# ============================================================
# GET ALL EMPLOYEES
# ============================================================

@router.get("/")
def get_employees(
    search: Optional[str] = Query(default=None),
    department: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(
        require_permission("MANAGE_EMPLOYEES")
    ),
):
    query = db.query(Employee)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Employee.employee_id.ilike(term),
                Employee.first_name.ilike(term),
                Employee.last_name.ilike(term),
                Employee.email.ilike(term),
            )
        )

    if department:
        query = query.filter(
            Employee.department == department
        )

    if status:
        query = query.filter(
            Employee.status == status.upper()
        )

    employees = query.order_by(Employee.id.desc()).all()

    result = []

    for employee in employees:
        employee_role = get_employee_role(db, employee)

        if role and employee_role.upper() != role.upper():
            continue

        result.append(
            employee_to_dict(
                employee,
                employee_role,
            )
        )

    return result


# ============================================================
# REGISTER EMPLOYEE
# ============================================================

@router.post("/", status_code=201)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_permission("REGISTER_EMPLOYEE")
    ),
):
    email = normalize_email(str(payload.email))

    if payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=422,
            detail="Password confirmation does not match.",
        )

    ensure_email_available(db, email)

    existing_employee_id = (
        db.query(Employee)
        .filter(
            Employee.employee_id == payload.employee_id
        )
        .first()
    )

    if existing_employee_id:
        raise HTTPException(
            status_code=409,
            detail="Employee ID already exists.",
        )

    requested_role = payload.role_name.strip().upper()
    role_name = normalize_role(requested_role)

    if payload.status.upper() not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid employee status.",
        )

    # Preserve CEO/DIRECTOR as designations while storing
    # their shared internal role as EXECUTIVE.
    designation = payload.designation

    if requested_role in {"CEO", "DIRECTOR"}:
        designation = requested_role

    try:
        employee = Employee(
            employee_id=payload.employee_id.strip(),
            first_name=payload.first_name.strip(),
            last_name=payload.last_name.strip(),
            email=email,
            phone=payload.phone,
            department=payload.department,
            designation=designation,
            joining_date=payload.joining_date,
            reporting_manager_id=payload.reporting_manager_id,
            employment_type=payload.employment_type,
            profile_image=payload.profile_image,
            status=payload.status.upper(),
        )

        db.add(employee)
        db.flush()

        user = User(
            employee_id=employee.id,
            email=email,
            password_hash=hash_password(payload.password),
            role_name=role_name,
        )

        db.add(user)
        db.commit()
        db.refresh(employee)

        return {
            "message": "Employee registered successfully.",
            "employee": employee_to_dict(
                employee,
                role_name,
            ),
        }

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Employee registration conflicts with existing data.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to register employee.",
        ) from exc


# ============================================================
# GET EMPLOYEE BY ID
# ============================================================

@router.get("/{employee_id}")
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_permission("MANAGE_EMPLOYEES")
    ),
):
    employee = get_employee_or_404(db, employee_id)

    return employee_to_dict(
        employee,
        get_employee_role(db, employee),
    )


# ============================================================
# UPDATE EMPLOYEE DETAILS
# Does not change login email or password.
# ============================================================

@router.put("/{employee_id}")
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_permission("MANAGE_EMPLOYEES")
    ),
):
    employee = get_employee_or_404(db, employee_id)

    updates = payload.model_dump(exclude_unset=True)

    if "status" in updates and updates["status"] is not None:
        updates["status"] = updates["status"].upper()

        if updates["status"] not in VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="Invalid employee status.",
            )

    try:
        for field, value in updates.items():
            setattr(employee, field, value)

        db.commit()
        db.refresh(employee)

        return {
            "message": "Employee details updated successfully.",
            "employee": employee_to_dict(
                employee,
                get_employee_role(db, employee),
            ),
        }

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to update employee details.",
        ) from exc


# ============================================================
# UPDATE EXISTING EMPLOYEE LOGIN EMAIL / PASSWORD
#
# PUT /api/employees/{employee_id}/account
#
# Email is required.
# Password is optional; omit it or send null to keep
# the current password.
# ============================================================

@router.put("/{employee_id}/account")
def update_employee_account(
    employee_id: int,
    payload: EmployeeAccountUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_permission("MANAGE_EMPLOYEES")
    ),
):
    employee = get_employee_or_404(db, employee_id)
    user = get_user_for_employee(db, employee)

    new_email = normalize_email(str(payload.email))

    ensure_email_available(
        db,
        email=new_email,
        employee_id=employee.id,
        user_id=user.id,
    )

    try:
        # Keep both email fields synchronized.
        employee.email = new_email
        user.email = new_email

        password_updated = False

        if payload.password is not None:
            if not payload.password.strip():
                raise HTTPException(
                    status_code=422,
                    detail="Password cannot contain only whitespace.",
                )

            if len(payload.password.encode("utf-8")) > 72:
                raise HTTPException(
                    status_code=422,
                    detail="Password must not exceed 72 UTF-8 bytes.",
                )

            user.password_hash = hash_password(
                payload.password
            )
            password_updated = True

        db.commit()
        db.refresh(employee)

        return {
            "message": "Employee account updated successfully.",
            "employee_id": employee.id,
            "email": new_email,
            "password_updated": password_updated,
        }

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The email conflicts with an existing account.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to update employee account.",
        ) from exc


# ============================================================
# ACTIVATE / DEACTIVATE EMPLOYEE
#
# POST /api/employees/{employee_id}/activate
# POST /api/employees/{employee_id}/deactivate
#
# Also accepts POST /api/employees/{employee_id}/{action}
# with action=activate or deactivate.
# ============================================================

@router.post("/{employee_id}/{action}")
def employee_action(
    employee_id: int,
    action: str,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_permission("MANAGE_EMPLOYEES")
    ),
):
    employee = get_employee_or_404(db, employee_id)

    normalized_action = action.strip().lower()

    if normalized_action == "activate":
        employee.status = "ACTIVE"

    elif normalized_action == "deactivate":
        employee.status = "INACTIVE"

    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported action. Use activate or deactivate.",
        )

    try:
        db.commit()
        db.refresh(employee)

        return {
            "message": f"Employee {normalized_action}d successfully.",
            "employee": employee_to_dict(
                employee,
                get_employee_role(db, employee),
            ),
        }

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to change employee status.",
        ) from exc


# ============================================================
# CHANGE EMPLOYEE ROLE / ACCESS
#
# PUT /api/employees/{employee_id}/access
# Body: {"role_name": "MANAGER"}
#
# Requires MANAGE_ACCESS permission.
# ============================================================

@router.put("/{employee_id}/access")
def update_employee_access(
    employee_id: int,
    payload: EmployeeAccessUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_permission("MANAGE_ACCESS")
    ),
):
    employee = get_employee_or_404(db, employee_id)
    user = get_user_for_employee(db, employee)

    requested_role = payload.role_name.strip().upper()
    new_role = normalize_role(requested_role)

    try:
        user.role_name = new_role

        if requested_role in {"CEO", "DIRECTOR"}:
            employee.designation = requested_role

        db.commit()
        db.refresh(employee)

        return {
            "message": "Employee access updated successfully.",
            "employee_id": employee.id,
            "role_name": user.role_name,
            "designation": employee.designation,
        }

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to update employee access.",
        ) from exc
