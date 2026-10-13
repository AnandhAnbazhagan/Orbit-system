from sqlalchemy import String,Integer,Text,Date,DateTime,ForeignKey,Float
from sqlalchemy.orm import Mapped,mapped_column
from datetime import datetime
from ..database import Base
class Task(Base):
    __tablename__="tasks"
    id:Mapped[int]=mapped_column(primary_key=True); project_id:Mapped[int|None]=mapped_column(ForeignKey("projects.id",ondelete="CASCADE")); title:Mapped[str]=mapped_column(String(200)); description:Mapped[str|None]=mapped_column(Text); assigned_employee_id:Mapped[int|None]=mapped_column(ForeignKey("employees.id",ondelete="SET NULL")); created_by:Mapped[int|None]=mapped_column(ForeignKey("employees.id",ondelete="SET NULL")); priority:Mapped[str]=mapped_column(String(20),default="MEDIUM"); status:Mapped[str]=mapped_column(String(30),default="TODO",index=True); start_date:Mapped[Date|None]=mapped_column(Date); deadline:Mapped[Date|None]=mapped_column(Date); estimated_hours:Mapped[float|None]=mapped_column(Float); actual_hours:Mapped[float|None]=mapped_column(Float); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow); updated_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
class TaskComment(Base):
    __tablename__="task_comments"
    id:Mapped[int]=mapped_column(primary_key=True); task_id:Mapped[int]=mapped_column(ForeignKey("tasks.id",ondelete="CASCADE")); user_id:Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE")); comment:Mapped[str]=mapped_column(Text); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
