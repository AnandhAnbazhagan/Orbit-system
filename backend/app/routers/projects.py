
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
import logging
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.project import Project
from ..models.task import Task
from ..core.permissions import require_permission

router = APIRouter(prefix="/api/projects", tags=["Projects"])
logger = logging.getLogger(__name__)


# =========================================================
# HELPERS
# =========================================================

def normalize_status(value: Any) -> str:
    """Normalize strings and Enum values such as TaskStatus.DONE."""
    if isinstance(value, Enum):
        value = value.value

    return str(value or "").split(".")[-1].strip().upper()


def serialize_value(value: Any) -> Any:
    """Convert database values into JSON-compatible values."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, Enum):
        return value.value

    return value


def get_model_fields(model) -> set[str]:
    """Return mapped database column names."""
    return {
        column.key
        for column in inspect(model).mapper.column_attrs
    }


def clean_optional_fields(values: dict) -> dict:
    """Convert empty strings to None."""
    cleaned = {}

    for key, value in values.items():
        if isinstance(value, str):
            value = value.strip()
            if value == "":
                value = None

        cleaned[key] = value

    return cleaned


def validate_project_dates(values: dict) -> None:
    """Validate project start date and deadline."""
    start_date = values.get("start_date")
    deadline = values.get("deadline")

    if start_date and deadline:
        # Normalize ISO date strings before comparing.
        if isinstance(start_date, str):
            start_date = date.fromisoformat(start_date[:10])

        if isinstance(deadline, str):
            deadline = date.fromisoformat(deadline[:10])

        if start_date > deadline:
            raise HTTPException(
                status_code=422,
                detail="Deadline cannot be earlier than the start date.",
            )


def get_project_foreign_key(field: str):
    """Find the referenced table for a project foreign-key field."""
    for foreign_key in Project.__table__.foreign_keys:
        if foreign_key.parent.name == field:
            return foreign_key.column.table.name

    return None


def creator_id_for_project(user):
    """Return the correct creator ID for the project's foreign key."""
    target_table = get_project_foreign_key("created_by")

    if target_table == "users":
        return getattr(user, "id", None)

    if target_table == "employees":
        return getattr(user, "employee_id", None)

    return None


def validate_project_references(values: dict, db: Session) -> None:
    """Validate project foreign-key references."""
    for field in ("manager_id", "team_id", "created_by"):
        value = values.get(field)

        if value is None:
            continue

        target_table = get_project_foreign_key(field)

        if not target_table:
            continue

        table = next(
            (
                item
                for item in Project.metadata.tables.values()
                if item.name == target_table
            ),
            None,
        )

        if table is None:
            continue

        primary_key = next(iter(table.primary_key.columns), None)

        if primary_key is None:
            continue

        exists = (
            db.query(primary_key)
            .select_from(table)
            .filter(primary_key == value)
            .first()
        )

        if not exists:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Invalid {field}: "
                    "referenced record does not exist."
                ),
            )


def ensure_unique_project_code(
    code: str | None,
    db: Session,
    exclude_id: int | None = None,
) -> None:
    """Prevent duplicate project codes."""
    if not code:
        return

    if "project_code" not in get_model_fields(Project):
        return

    query = db.query(Project).filter(
        Project.project_code == code
    )

    if exclude_id is not None:
        query = query.filter(Project.id != exclude_id)

    if query.first():
        raise HTTPException(
            status_code=409,
            detail="A project with this project code already exists.",
        )


# =========================================================
# PROJECT PROGRESS
# =========================================================

def calculate_progress(project_id: int, db: Session) -> int:
    """
    Calculate progress using the current task records.

    DONE and COMPLETED count as completed.
    No tasks means 0% progress.
    """
    tasks = (
        db.query(Task.id, Task.status)
        .filter(Task.project_id == project_id)
        .all()
    )

    if not tasks:
        return 0

    completed_statuses = {"DONE", "COMPLETED"}

    completed_count = sum(
        1
        for task_id, status in tasks
        if normalize_status(status) in completed_statuses
    )

    return round(completed_count * 100 / len(tasks))


# =========================================================
# PROJECT SERIALIZATION
# =========================================================

def project_to_dict(project, db: Session) -> dict:
    """Return project fields with freshly calculated task progress."""
    fields = get_model_fields(Project)

    result = {
        field: serialize_value(getattr(project, field, None))
        for field in fields
    }

    result["id"] = project.id
    result["progress"] = calculate_progress(project.id, db)

    return result


def apply_project_values(project, values: dict) -> None:
    """Apply only columns that exist on the Project model."""
    allowed_fields = get_model_fields(Project)

    for field, value in values.items():
        if field in allowed_fields and field not in {
            "id",
            "progress",
        }:
            setattr(project, field, value)


# =========================================================
# GET ALL PROJECTS
# =========================================================

@router.get("")
def list_projects(
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_PROJECTS")),
):
    try:
        projects_list = (
            db.query(Project)
            .order_by(Project.id.desc())
            .all()
        )

        return [
            project_to_dict(project, db)
            for project in projects_list
        ]

    except SQLAlchemyError as exc:
        logger.exception("Unable to load projects")

        raise HTTPException(
            status_code=500,
            detail="Unable to load projects.",
        ) from exc


# =========================================================
# GET ONE PROJECT
# =========================================================

@router.get("/{project_id}")
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_PROJECTS")),
):
    project = db.get(Project, project_id)

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found.",
        )

    return project_to_dict(project, db)


# =========================================================
# CREATE PROJECT
# =========================================================

@router.post("", status_code=201)
def create_project(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_PROJECTS")),
):
    values = clean_optional_fields(dict(data))

    # Progress is calculated from tasks, never from client input.
    values.pop("progress", None)
    values.pop("id", None)

    if not values.get("name"):
        raise HTTPException(
            status_code=422,
            detail="Project name is required.",
        )

    if "created_by" in get_model_fields(Project):
        values["created_by"] = creator_id_for_project(user)

    validate_project_dates(values)
    ensure_unique_project_code(values.get("project_code"), db)
    validate_project_references(values, db)

    project = Project()
    apply_project_values(project, values)

    try:
        db.add(project)
        db.commit()
        db.refresh(project)

        return {
            "message": "Project created successfully.",
            "project": project_to_dict(project, db),
        }

    except IntegrityError as exc:
        db.rollback()

        logger.exception("Project creation failed due to a database constraint")

        raise HTTPException(
            status_code=409,
            detail=(
                "Unable to create project because of "
                "a database constraint."
            ),
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Unable to create project")

        raise HTTPException(
            status_code=500,
            detail="Unable to create project.",
        ) from exc


# =========================================================
# UPDATE PROJECT
# =========================================================

@router.put("/{project_id}")
def update_project(
    project_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_PROJECTS")),
):
    project = db.get(Project, project_id)

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found.",
        )

    values = clean_optional_fields(dict(data))

    # Do not allow the frontend to overwrite calculated progress.
    values.pop("progress", None)
    values.pop("id", None)
    values.pop("created_by", None)

    validate_project_dates({
        "start_date": values.get(
            "start_date",
            getattr(project, "start_date", None),
        ),
        "deadline": values.get(
            "deadline",
            getattr(project, "deadline", None),
        ),
    })

    if "project_code" in values:
        ensure_unique_project_code(
            values.get("project_code"),
            db,
            exclude_id=project_id,
        )

    validate_project_references(values, db)
    apply_project_values(project, values)

    try:
        db.commit()
        db.refresh(project)

        return {
            "message": "Project updated successfully.",
            "project": project_to_dict(project, db),
        }

    except IntegrityError as exc:
        db.rollback()

        logger.exception("Project update failed due to a database constraint")

        raise HTTPException(
            status_code=409,
            detail=(
                "Unable to update project because of "
                "a database constraint."
            ),
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Unable to update project")

        raise HTTPException(
            status_code=500,
            detail="Unable to update project.",
        ) from exc


# =========================================================
# DELETE PROJECT
# =========================================================

@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_PROJECTS")),
):
    project = db.get(Project, project_id)

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found.",
        )

    try:
        db.delete(project)
        db.commit()

        return {
            "message": "Project deleted successfully."
        }

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "This project cannot be deleted because related "
                "tasks or records still reference it."
            ),
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Unable to delete project")

        raise HTTPException(
            status_code=500,
            detail="Unable to delete project.",
        ) from exc
