from datetime import date

from pydantic import BaseModel


class TaskCreate(BaseModel):
    project_id: int | None = None

    title: str

    description: str | None = None

    assigned_employee_id: int | None = None

    priority: str = "MEDIUM"

    status: str = "TODO"

    start_date: date | None = None

    deadline: date | None = None

    estimated_hours: float | None = None

    actual_hours: float | None = None