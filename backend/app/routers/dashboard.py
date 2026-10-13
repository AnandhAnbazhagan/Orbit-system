import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..core.security import get_current_user
from ..models.employee import Employee 
from ..models.project import Project
from ..models.task import Task
from ..models.inventory import InventoryItem


logger = logging.getLogger("orbit.dashboard")

router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard"],
)


@router.get("")
def get_dashboard(
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return live dashboard statistics for the authenticated user.

    Authentication:
        Requires a valid JWT access token.

    Returns:
        Employee, project, task and inventory statistics,
        plus project and task status counts.
    """

    try:
        # -----------------------------------------------
        # 1. Dashboard statistics
        # -----------------------------------------------

        total_employees = db.query(Employee).count()

        active_projects = (
            db.query(Project)
            .filter(Project.status == "IN_PROGRESS")
            .count()
        )

        pending_tasks = (
            db.query(Task)
            .filter(Task.status != "DONE")
            .count()
        )

        completed_tasks = (
            db.query(Task)
            .filter(Task.status == "DONE")
            .count()
        )

        total_inventory_items = (
            db.query(InventoryItem).count()
        )

        low_stock_items = (
            db.query(InventoryItem)
            .filter(
                InventoryItem.quantity
                <= InventoryItem.minimum_stock
            )
            .count()
        )

        # -----------------------------------------------
        # 2. Projects grouped by status
        # -----------------------------------------------

        project_status_rows = (
            db.query(
                Project.status,
                func.count(Project.id),
            )
            .group_by(Project.status)
            .all()
        )

        project_status = {
            status: count
            for status, count in project_status_rows
            if status is not None
        }

        # -----------------------------------------------
        # 3. Tasks grouped by status
        # -----------------------------------------------

        task_status_rows = (
            db.query(
                Task.status,
                func.count(Task.id),
            )
            .group_by(Task.status)
            .all()
        )

        task_status = {
            status: count
            for status, count in task_status_rows
            if status is not None
        }

        # -----------------------------------------------
        # 4. Return dashboard response
        # -----------------------------------------------

        return {
            "stats": {
                "employees": total_employees,
                "active_projects": active_projects,
                "pending_tasks": pending_tasks,
                "completed_tasks": completed_tasks,
                "inventory_items": total_inventory_items,
                "low_stock": low_stock_items,
            },
            "project_status": project_status,
            "task_status": task_status,
        }

    except SQLAlchemyError:
        logger.exception(
            "Database error while loading dashboard"
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to load dashboard data. "
                   "Check the backend logs.",
        )