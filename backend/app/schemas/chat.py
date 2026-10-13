
# backend/app/schemas/chat.py

from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    name: str | None = None
    conversation_type: str = "DIRECT"
    member_user_ids: list[int] = Field(default_factory=list)


class MessageCreate(BaseModel):
    message: str | None = None
    message_type: str = "TEXT"
    file_name: str | None = None
    file_path: str | None = None

