from sqlalchemy.orm import Session

from ..models.notification import Notification


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str = "SYSTEM",
    commit: bool = True,
) -> Notification:
    """Create a notification for one user."""

    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=notification_type,
        is_read=False,
    )

    db.add(notification)

    if commit:
        db.commit()
        db.refresh(notification)

    return notification


def notify_users(
    db: Session,
    user_ids: list[int],
    title: str,
    message: str,
    notification_type: str = "SYSTEM",
) -> int:
    """Create the same notification for multiple users."""

    unique_ids = set(user_ids)

    for user_id in unique_ids:
        db.add(
            Notification(
                user_id=user_id,
                title=title,
                message=message,
                type=notification_type,
                is_read=False,
            )
        )

    db.commit()
    return len(unique_ids)