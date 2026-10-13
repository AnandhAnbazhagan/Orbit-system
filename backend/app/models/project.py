from sqlalchemy import String,Integer,Text,Date,DateTime,ForeignKey,Numeric
from sqlalchemy.orm import Mapped,mapped_column
from datetime import datetime
from ..database import Base
class Project(Base):
    __tablename__="projects"
    id:Mapped[int]=mapped_column(primary_key=True); project_code:Mapped[str]=mapped_column(String(40),unique=True,index=True); name:Mapped[str]=mapped_column(String(200)); description:Mapped[str|None]=mapped_column(Text)
    client:Mapped[str|None]=mapped_column(String(200)); manager_id:Mapped[int|None]=mapped_column(ForeignKey("employees.id",ondelete="SET NULL")); team_id:Mapped[int|None]=mapped_column(ForeignKey("teams.id",ondelete="SET NULL")); start_date:Mapped[Date|None]=mapped_column(Date); deadline:Mapped[Date|None]=mapped_column(Date); status:Mapped[str]=mapped_column(String(30),default="PLANNED",index=True); priority:Mapped[str]=mapped_column(String(20),default="MEDIUM"); budget:Mapped[float|None]=mapped_column(Numeric(14,2)); created_by:Mapped[int|None]=mapped_column(ForeignKey("employees.id",ondelete="SET NULL")); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class ProjectMember(Base):
    __tablename__="project_members"
    id:Mapped[int]=mapped_column(primary_key=True); project_id:Mapped[int]=mapped_column(ForeignKey("projects.id",ondelete="CASCADE")); employee_id:Mapped[int]=mapped_column(ForeignKey("employees.id",ondelete="CASCADE")); member_role:Mapped[str|None]=mapped_column(String(50))
