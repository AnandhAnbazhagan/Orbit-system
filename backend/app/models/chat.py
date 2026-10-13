from sqlalchemy import String,Integer,Text,DateTime,ForeignKey,Boolean
from sqlalchemy.orm import Mapped,mapped_column
from datetime import datetime
from ..database import Base
class ChatConversation(Base):
    __tablename__="chat_conversations"
    id:Mapped[int]=mapped_column(primary_key=True); name:Mapped[str|None]=mapped_column(String(200)); conversation_type:Mapped[str]=mapped_column(String(40),default="DIRECT"); project_id:Mapped[int|None]=mapped_column(ForeignKey("projects.id",ondelete="SET NULL")); team_id:Mapped[int|None]=mapped_column(ForeignKey("teams.id",ondelete="SET NULL")); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class ChatMember(Base):
    __tablename__="chat_members"
    id:Mapped[int]=mapped_column(primary_key=True); conversation_id:Mapped[int]=mapped_column(ForeignKey("chat_conversations.id",ondelete="CASCADE")); user_id:Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE"))
class ChatMessage(Base):
    __tablename__="chat_messages"
    id:Mapped[int]=mapped_column(primary_key=True); conversation_id:Mapped[int]=mapped_column(ForeignKey("chat_conversations.id",ondelete="CASCADE")); sender_id:Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE")); message:Mapped[str|None]=mapped_column(Text); message_type:Mapped[str]=mapped_column(String(20),default="TEXT"); file_name:Mapped[str|None]=mapped_column(String(255)); file_path:Mapped[str|None]=mapped_column(String(500)); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
