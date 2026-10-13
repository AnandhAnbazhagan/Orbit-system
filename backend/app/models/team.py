from sqlalchemy import String,Integer,Text,DateTime,ForeignKey
from sqlalchemy.orm import Mapped,mapped_column
from datetime import datetime
from ..database import Base
class Team(Base):
    __tablename__="teams"
    id:Mapped[int]=mapped_column(primary_key=True); name:Mapped[str]=mapped_column(String(150)); department:Mapped[str|None]=mapped_column(String(100)); leader_id:Mapped[int|None]=mapped_column(ForeignKey("employees.id",ondelete="SET NULL")); description:Mapped[str|None]=mapped_column(Text); status:Mapped[str]=mapped_column(String(30),default="ACTIVE"); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class TeamMember(Base):
    __tablename__="team_members"
    id:Mapped[int]=mapped_column(primary_key=True); team_id:Mapped[int]=mapped_column(ForeignKey("teams.id",ondelete="CASCADE")); employee_id:Mapped[int]=mapped_column(ForeignKey("employees.id",ondelete="CASCADE")); role_in_team:Mapped[str|None]=mapped_column(String(80)); joined_date:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
