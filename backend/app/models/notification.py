from sqlalchemy import String,Integer,Text,DateTime,ForeignKey,Boolean
from sqlalchemy.orm import Mapped,mapped_column
from datetime import datetime
from ..database import Base
class Notification(Base):
    __tablename__="notifications"
    id:Mapped[int]=mapped_column(primary_key=True); user_id:Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE")); title:Mapped[str]=mapped_column(String(200)); message:Mapped[str]=mapped_column(Text); type:Mapped[str]=mapped_column(String(50)); is_read:Mapped[bool]=mapped_column(Boolean,default=False,index=True); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class ActivityLog(Base):
    __tablename__="activity_logs"
    id:Mapped[int]=mapped_column(primary_key=True); user_id:Mapped[int|None]=mapped_column(ForeignKey("users.id",ondelete="SET NULL")); action:Mapped[str]=mapped_column(String(80),index=True); entity_type:Mapped[str|None]=mapped_column(String(80)); entity_id:Mapped[int|None]=mapped_column(Integer); description:Mapped[str|None]=mapped_column(Text); ip_address:Mapped[str|None]=mapped_column(String(64)); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class FileRecord(Base):
    __tablename__="files"
    id:Mapped[int]=mapped_column(primary_key=True); owner_id:Mapped[int|None]=mapped_column(ForeignKey("users.id",ondelete="SET NULL")); entity_type:Mapped[str|None]=mapped_column(String(80)); entity_id:Mapped[int|None]=mapped_column(Integer); file_name:Mapped[str]=mapped_column(String(255)); file_path:Mapped[str]=mapped_column(String(500)); mime_type:Mapped[str|None]=mapped_column(String(120)); size_bytes:Mapped[int]=mapped_column(Integer); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
