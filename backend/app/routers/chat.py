from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.chat import ChatConversation, ChatMember, ChatMessage
from ..models.user import User
from ..models.employee import Employee
from ..models.notification import Notification
from ..schemas.chat import ConversationCreate, MessageCreate
from ..core.security import get_current_user
from ..core.config import settings


router = APIRouter(prefix="/api/chat", tags=["Chat"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "chat"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_MB = int(getattr(settings, "MAX_UPLOAD_MB", 10))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


# =========================================================
# USER / EMPLOYEE DISPLAY NAME
# =========================================================

def get_user_display_name(user_id: int, db: Session) -> str:
    user = db.get(User, user_id)

    if not user:
        return "Unknown user"

    employee = None

    if user.employee_id:
        employee = db.get(Employee, user.employee_id)

    if employee is None and user.email:
        employee = (
            db.query(Employee)
            .filter(Employee.email == user.email)
            .first()
        )

    if employee:
        full_name = " ".join(
            part.strip()
            for part in [
                employee.first_name or "",
                employee.last_name or "",
            ]
            if part and part.strip()
        )

        if full_name:
            return full_name

    return user.email or f"User {user.id}"


# =========================================================
# CONVERSATION MEMBERSHIP VALIDATION
# =========================================================

def require_conversation_member(
    conversation_id: int,
    user_id: int,
    db: Session,
) -> ChatConversation:

    conversation = db.get(ChatConversation, conversation_id)

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    membership = (
        db.query(ChatMember)
        .filter(
            ChatMember.conversation_id == conversation_id,
            ChatMember.user_id == user_id,
        )
        .first()
    )

    if membership is None:
        raise HTTPException(
            status_code=403,
            detail="You are not a member of this conversation",
        )

    return conversation


# =========================================================
# MESSAGE SERIALIZATION
# =========================================================

def serialize_message(message: ChatMessage, db: Session) -> dict:
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_name": get_user_display_name(message.sender_id, db),
        "message": message.message,
        "message_type": message.message_type,
        "file_name": message.file_name,
        "file_path": message.file_path,
        "created_at": message.created_at,
    }


# =========================================================
# CONVERSATION SERIALIZATION
# =========================================================

def serialize_conversation(
    conversation: ChatConversation,
    db: Session,
    current_user_id: int,
) -> dict:

    memberships = (
        db.query(ChatMember)
        .filter(ChatMember.conversation_id == conversation.id)
        .all()
    )

    members = []

    for membership in memberships:
        user = db.get(User, membership.user_id)

        if user:
            members.append({
                "user_id": user.id,
                "name": get_user_display_name(user.id, db),
                "email": user.email,
                "role_name": user.role_name,
            })

    last_message = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(
            ChatMessage.created_at.desc(),
            ChatMessage.id.desc(),
        )
        .first()
    )

    conversation_type = (
        conversation.conversation_type or "DIRECT"
    ).upper()

    display_title = conversation.name

    if conversation_type == "DIRECT":
        other_member = next(
            (
                member for member in members
                if member["user_id"] != current_user_id
            ),
            None,
        )

        if other_member:
            display_title = other_member["name"]

    if not display_title:
        display_title = (
            "Group chat"
            if conversation_type == "GROUP"
            else "New conversation"
        )

    return {
        "id": conversation.id,
        "name": display_title,
        "type": conversation_type,
        "conversation_type": conversation_type,
        "members": members,
        "last_message": (
            last_message.message if last_message else None
        ),
        "last_message_at": (
            last_message.created_at
            if last_message
            else conversation.created_at
        ),
        "created_at": conversation.created_at,
    }


# =========================================================
# LIST CONVERSATIONS
# GET /api/chat/conversations
# =========================================================

@router.get("/conversations")
def get_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    memberships = (
        db.query(ChatMember)
        .filter(ChatMember.user_id == current_user.id)
        .all()
    )

    conversation_ids = [
        membership.conversation_id
        for membership in memberships
    ]

    if not conversation_ids:
        return []

    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.id.in_(conversation_ids))
        .order_by(ChatConversation.created_at.desc())
        .all()
    )

    results = [
        serialize_conversation(
            conversation,
            db,
            current_user.id,
        )
        for conversation in conversations
    ]

    results.sort(
        key=lambda item: item["last_message_at"]
        or item["created_at"],
        reverse=True,
    )

    return results


# =========================================================
# CREATE PRIVATE OR GROUP CONVERSATION
# POST /api/chat/conversations
# =========================================================

@router.post("/conversations")
def create_conversation(
    data: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    conversation_type = (
        data.conversation_type or "DIRECT"
    ).strip().upper()

    if conversation_type not in {"DIRECT", "GROUP"}:
        raise HTTPException(
            status_code=400,
            detail="conversation_type must be DIRECT or GROUP",
        )

    # These IDs must be users.id, not employees.id.
    member_user_ids = {
        int(user_id)
        for user_id in (data.member_user_ids or [])
    }

    member_user_ids.add(current_user.id)

    if conversation_type == "DIRECT" and len(member_user_ids) != 2:
        raise HTTPException(
            status_code=400,
            detail="A private conversation requires exactly one other user",
        )

    if conversation_type == "GROUP" and len(member_user_ids) < 2:
        raise HTTPException(
            status_code=400,
            detail="A group conversation requires at least two users",
        )

    users = (
        db.query(User)
        .filter(User.id.in_(member_user_ids))
        .all()
    )

    users_by_id = {user.id: user for user in users}
    missing_ids = member_user_ids - set(users_by_id.keys())

    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"User account(s) not found: {sorted(missing_ids)}",
        )

    inactive_ids = [
        user.id for user in users
        if not user.is_active
    ]

    if inactive_ids:
        raise HTTPException(
            status_code=400,
            detail="Cannot create a conversation with an inactive user",
        )

    # Prevent duplicate direct conversations.
    if conversation_type == "DIRECT":
        existing_conversations = (
            db.query(ChatConversation)
            .filter(
                ChatConversation.conversation_type == "DIRECT"
            )
            .all()
        )

        for existing in existing_conversations:
            existing_members = {
                membership.user_id
                for membership in (
                    db.query(ChatMember)
                    .filter(
                        ChatMember.conversation_id == existing.id
                    )
                    .all()
                )
            }

            if existing_members == member_user_ids:
                return serialize_conversation(
                    existing,
                    db,
                    current_user.id,
                )

    try:
        conversation = ChatConversation(
            name=(
                data.name.strip()
                if data.name and data.name.strip()
                else None
            ),
            conversation_type=conversation_type,
        )

        db.add(conversation)
        db.flush()

        for user_id in sorted(member_user_ids):
            db.add(
                ChatMember(
                    conversation_id=conversation.id,
                    user_id=user_id,
                )
            )

        db.commit()
        db.refresh(conversation)

        return serialize_conversation(
            conversation,
            db,
            current_user.id,
        )

    except Exception:
        db.rollback()
        raise


# =========================================================
# GET MESSAGES
# GET /api/chat/{conversation_id}/messages
# =========================================================

@router.get("/{conversation_id}/messages")
def get_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    require_conversation_member(
        conversation_id,
        current_user.id,
        db,
    )

    messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.conversation_id == conversation_id
        )
        .order_by(
            ChatMessage.created_at.asc(),
            ChatMessage.id.asc(),
        )
        .all()
    )

    return [
        serialize_message(message, db)
        for message in messages
    ]


# =========================================================
# SEND MESSAGE + NOTIFY RECIPIENTS
# POST /api/chat/{conversation_id}/messages
# =========================================================

@router.post("/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    conversation = require_conversation_member(
        conversation_id,
        current_user.id,
        db,
    )

    message_text = (
        data.message.strip()
        if data.message
        else ""
    )

    message_type = (
        data.message_type or "TEXT"
    ).strip().upper()

    if message_type not in {
        "TEXT", "IMAGE", "DOCUMENT", "FILE"
    }:
        raise HTTPException(
            status_code=400,
            detail="Invalid message type",
        )

    if not message_text and not data.file_path:
        raise HTTPException(
            status_code=400,
            detail="Enter a message or attach a file",
        )

    # Validate attachment path and existence.
    if data.file_path:
        prefix = "/api/chat/files/"

        if not data.file_path.startswith(prefix):
            raise HTTPException(
                status_code=400,
                detail="Invalid attachment path",
            )

        stored_name = data.file_path[len(prefix):]

        if (
            not stored_name
            or Path(stored_name).name != stored_name
            or stored_name in {".", ".."}
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid attachment filename",
            )

        file_on_disk = UPLOAD_DIR / stored_name

        if not file_on_disk.is_file():
            raise HTTPException(
                status_code=404,
                detail="Uploaded attachment was not found",
            )

    try:
        chat_message = ChatMessage(
            conversation_id=conversation_id,
            sender_id=current_user.id,
            message=message_text or None,
            message_type=message_type,
            file_name=data.file_name,
            file_path=data.file_path,
        )

        db.add(chat_message)
        db.flush()

        recipients = (
            db.query(ChatMember)
            .filter(
                ChatMember.conversation_id == conversation_id,
                ChatMember.user_id != current_user.id,
            )
            .all()
        )

        sender_name = get_user_display_name(
            current_user.id,
            db,
        )

        conversation_type = (
            conversation.conversation_type or "DIRECT"
        ).upper()

        conversation_name = conversation.name or (
            "group conversation"
            if conversation_type == "GROUP"
            else "your conversation"
        )

        for recipient in recipients:
            db.add(
                Notification(
                    user_id=recipient.user_id,
                    title="New chat message",
                    message=(
                        f"{sender_name} sent you a message "
                        f"in {conversation_name}."
                    ),
                    type="CHAT",
                    is_read=False,
                )
            )

        # Message and notifications are committed together.
        db.commit()
        db.refresh(chat_message)

        return serialize_message(chat_message, db)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to send the chat message.",
        )


# =========================================================
# UPLOAD CHAT ATTACHMENT
# POST /api/chat/upload?conversation_id=1
# =========================================================

@router.post("/upload")
async def upload_chat_file(
    conversation_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    require_conversation_member(
        conversation_id,
        current_user.id,
        db,
    )

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No filename was provided",
        )

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="This file type is not allowed",
        )

    original_name = Path(file.filename).name

    if original_name in {"", ".", ".."}:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename",
        )

    suffix = Path(original_name).suffix[:20]
    stored_name = f"{uuid4().hex}{suffix}"
    destination = UPLOAD_DIR / stored_name

    try:
        contents = await file.read(MAX_UPLOAD_BYTES + 1)

        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds the {MAX_UPLOAD_MB} MB limit",
            )

        if not contents:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty",
            )

        destination.write_bytes(contents)

    finally:
        await file.close()

    message_type = (
        "IMAGE"
        if file.content_type.startswith("image/")
        else "DOCUMENT"
    )

    return {
        "file_name": original_name,
        "file_path": f"/api/chat/files/{stored_name}",
        "message_type": message_type,
    }


# =========================================================
# DOWNLOAD / VIEW CHAT FILE
# GET /api/chat/files/{stored_name}
# =========================================================

@router.get("/files/{stored_name}")
def get_chat_file(
    stored_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    if (
        not stored_name
        or Path(stored_name).name != stored_name
        or stored_name in {".", ".."}
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid filename",
        )

    file_path = UPLOAD_DIR / stored_name

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    expected_path = f"/api/chat/files/{stored_name}"

    chat_message = (
        db.query(ChatMessage)
        .filter(ChatMessage.file_path == expected_path)
        .first()
    )

    if chat_message is None:
        raise HTTPException(
            status_code=404,
            detail="Attachment record not found",
        )

    require_conversation_member(
        chat_message.conversation_id,
        current_user.id,
        db,
    )

    return FileResponse(
        path=file_path,
        filename=chat_message.file_name or stored_name,
        content_disposition_type="attachment",
    )
