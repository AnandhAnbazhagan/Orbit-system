
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.task import Task
from ..models.employee import Employee
from ..schemas.task import TaskCreate
from ..core.permissions import require_permission
from ..core.notification_service import create_notification

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/tasks",
    tags=["Tasks"],
)


# =========================================================
# HELPERS
# =========================================================

def task_to_dict(task: Task) -> dict:
    """Return task data, including its current status and project."""
    return {
        "id": task.id,
        "project_id": task.project_id,
        "title": task.title,
        "description": task.description,
        "assigned_employee_id": task.assigned_employee_id,
        "priority": task.priority,
        "status": (
            str(task.status).split(".")[-1].upper()
            if task.status is not None
            else "TODO"
        ),
        "start_date": task.start_date,
        "deadline": task.deadline,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
    }


def notify_assigned_employee(
    db: Session,
    employee_id: int | None,
    task: Task,
) -> None:
    """
    Send a notification when the employee has a linked user account.

    getattr() avoids a Pylance attribute error if Employee.user_id
    is not declared by the current Employee model.
    """
    if not employee_id:
        return

    employee = db.get(Employee, employee_id)

    if employee is None:
        return

    # Avoid directly accessing an attribute that may not exist
    # in the current Employee model.
    linked_user_id = getattr(employee, "user_id", None)

    if not linked_user_id:
        logger.debug(
            "Skipping notification for employee %s: "
            "no user_id attribute or linked user account found.",
            employee_id,
        )
        return

    try:
        create_notification(
            db=db,
            user_id=linked_user_id,
            title="Task assigned",
            message=f"You have been assigned a task: {task.title}",
            notification_type="TASK",
        )
    except Exception:
        # A notification failure must not undo an already-saved task.
        logger.exception(
            "Could not create notification for employee %s",
            employee_id,
        )


# =========================================================
# GET ALL TASKS
# =========================================================

@router.get("")
def list_tasks(
    db: Session = Depends(get_db),
    user=Depends(require_permission("VIEW_DASHBOARD")),
):
    try:
        tasks = (
            db.query(Task)
            .order_by(Task.deadline)
            .all()
        )

        return [task_to_dict(task) for task in tasks]

    except SQLAlchemyError as exc:
        logger.exception("Unable to retrieve tasks")
        raise HTTPException(
            status_code=500,
            detail="Unable to load tasks.",
        ) from exc


# =========================================================
# CREATE TASK
# =========================================================

@router.post("", status_code=201)
def create_task(
    data: TaskCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_TASKS")),
):
    try:
        values = data.model_dump()

        task = Task(
            **values,
            created_by=getattr(user, "employee_id", None),
        )

        db.add(task)
        db.commit()
        db.refresh(task)

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Unable to create task")

        raise HTTPException(
            status_code=500,
            detail="Unable to create task. Check the submitted data.",
        ) from exc

    # Notify only after the task has been committed successfully.
    notify_assigned_employee(
        db=db,
        employee_id=task.assigned_employee_id,
        task=task,
    )

    return {
        "message": "Task created successfully.",
        **task_to_dict(task),
    }


# =========================================================
# UPDATE TASK
# =========================================================

@router.put("/{id}")
def update_task(
    id: int,
    data: TaskCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_TASKS")),
):
    task = db.get(Task, id)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found.",
        )

    previous_employee_id = task.assigned_employee_id

    # Apply fields provided by the client.
    values = data.model_dump(exclude_unset=True)

    try:
        for field, value in values.items():
            if not hasattr(task, field):
                raise HTTPException(
                    status_code=422,
                    detail=f"Unknown task field: {field}",
                )

            setattr(task, field, value)

        db.commit()
        db.refresh(task)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Unable to update task id=%s", id)

        raise HTTPException(
            status_code=500,
            detail="Unable to update task.",
        ) from exc

    # Notify if the task was reassigned.
    if task.assigned_employee_id != previous_employee_id:
        notify_assigned_employee(
            db=db,
            employee_id=task.assigned_employee_id,
            task=task,
        )

    # Return the saved status so the frontend can refresh progress.
    return {
        "message": "Task updated successfully.",
        **task_to_dict(task),
    }


# =========================================================
# DELETE TASK
# =========================================================

@router.delete("/{id}")
def delete_task(
    id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_TASKS")),
):
    task = db.get(Task, id)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found.",
        )

    try:
        db.delete(task)
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Unable to delete task id=%s", id)

        raise HTTPException(
            status_code=500,
            detail="Unable to delete task.",
        ) from exc

    return {
        "message": "Task deleted successfully.",
        "id": id,
    }
