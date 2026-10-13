
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.notification import Notification
from ..core.security import get_current_user

router = APIRouter(
    prefix="/api/notifications",
    tags=["Notifications"],
)


def serialize_notification(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "title": notification.title,
        "message": notification.message,
        "type": notification.type,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat()
        if notification.created_at
        else None,
    }


# =========================================================
# LIST NOTIFICATIONS
# GET /api/notifications?filter=all
# filter: all, unread, read
# =========================================================

@router.get("")
def list_notifications(
    filter: str = Query(default="all", pattern="^(all|unread|read)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    query = db.query(Notification).filter(
        Notification.user_id == user.id
    )

    if filter == "unread":
        query = query.filter(Notification.is_read.is_(False))
    elif filter == "read":
        query = query.filter(Notification.is_read.is_(True))

    total = query.count()

    notifications = (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    unread_count = (
        db.query(Notification)
        .filter(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
        .count()
    )

    return {
        "items": [
            serialize_notification(item)
            for item in notifications
        ],
        "total": total,
        "unread_count": unread_count,
        "limit": limit,
        "offset": offset,
    }


# =========================================================
# UNREAD COUNT
# GET /api/notifications/unread-count
# =========================================================

@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    count = (
        db.query(Notification)
        .filter(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
        .count()
    )

    return {"unread_count": count}


# =========================================================
# MARK ONE NOTIFICATION AS READ
# PATCH /api/notifications/{notification_id}/read
# =========================================================

@router.patch("/{notification_id}/read")
def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
        .first()
    )

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    notification.is_read = True
    db.commit()

    return {
        "message": "Notification marked as read",
        "id": notification.id,
        "is_read": True,
    }


# =========================================================
# MARK ALL NOTIFICATIONS AS READ
# PATCH /api/notifications/read-all
# =========================================================

@router.patch("/read-all")
def mark_all_as_read(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    updated = (
        db.query(Notification)
        .filter(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
        .update(
            {Notification.is_read: True},
            synchronize_session=False,
        )
    )

    db.commit()

    return {
        "message": "All notifications marked as read",
        "updated_count": updated,
    }


# =========================================================
# DELETE ONE NOTIFICATION
# DELETE /api/notifications/{notification_id}
# =========================================================

@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
        .first()
    )

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    db.delete(notification)
    db.commit()

    return {
        "message": "Notification deleted",
        "id": notification_id,
    }