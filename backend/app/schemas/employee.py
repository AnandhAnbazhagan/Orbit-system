from datetime import date
from pydantic import BaseModel, EmailStr, ConfigDict, Field


class EmployeeCreate(BaseModel):
    employee_id: str
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    department: str | None = None
    designation: str | None = None
    joining_date: date | None = None
    role_name: str = "EMPLOYEE"
    reporting_manager_id: int | None = None
    employment_type: str | None = None
    password: str
    confirm_password: str
    profile_image: str | None = None
    status: str = "ACTIVE"


class EmployeeUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    department: str | None = None
    designation: str | None = None
    joining_date: date | None = None
    reporting_manager_id: int | None = None
    employment_type: str | None = None
    status: str | None = None


class EmployeeAccountUpdate(BaseModel):
    email: EmailStr
    password: str | None = Field(
        default=None,
        min_length=8,
        description="Leave blank or omit to keep the current password.",
    )


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: str
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    department: str | None = None
    designation: str | None = None
    joining_date: date | None = None
    role_name: str
    status: str