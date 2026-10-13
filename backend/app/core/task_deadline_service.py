from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models.task import Task
from ..models.employee import Employee
from ..models.notification import Notification


def check_task_deadlines(db: Session) -> int:
    """
    Create notifications for tasks due today/tomorrow
    and tasks that are overdue.

    Returns the number of notifications created.
    """

    today = date.today()
    tomorrow = today + timedelta(days=1)
    created_count = 0

    tasks = (
        db.query(Task)
        .filter(
            Task.assigned_employee_id.isnot(None),
            Task.deadline.isnot(None),
            Task.status.notin_(
                ["DONE", "COMPLETED", "CANCELLED"]
            ),
        )
        .all()
    )

    try:
        for task in tasks:
            employee = (
                db.query(Employee)
                .filter(
                    Employee.id == task.assigned_employee_id
                )
                .first()
            )

            if not employee:
                continue

            # The Employee model must link to users.id.
            user_id = getattr(employee, "user_id", None)

            if not user_id:
                continue

            if task.deadline < today:
                title = "Task overdue"
                notification_type = "TASK_OVERDUE"

            elif task.deadline <= tomorrow:
                title = "Task deadline approaching"
                notification_type = "TASK_DEADLINE"

            else:
                continue

            message = (
                f"Task #{task.id}: {task.title} "
                f"is due on {task.deadline.isoformat()}."
                if notification_type == "TASK_DEADLINE"
                else
                f"Task #{task.id}: {task.title} "
                f"was due on {task.deadline.isoformat()}."
            )

            # Avoid duplicates for this task, deadline and type.
            existing = (
                db.query(Notification.id)
                .filter(
                    Notification.user_id == user_id,
                    Notification.type == notification_type,
                    Notification.message == message,
                )
                .first()
            )

            if existing:
                continue

            notification = Notification(
                user_id=user_id,
                title=title,
                message=message,
                type=notification_type,
                is_read=False,
            )

            db.add(notification)
            created_count += 1

        if created_count:
            db.commit()

        return created_count

    except Exception:
        db.rollback()
        raise
