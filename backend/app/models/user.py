from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from ..database import Base

class User(Base):
    __tablename__="users"
    id:Mapped[int]=mapped_column(primary_key=True)
    email:Mapped[str]=mapped_column(String(255),unique=True,index=True)
    password_hash:Mapped[str]=mapped_column(String(255))
    role_name:Mapped[str]=mapped_column(String(30),default="EMPLOYEE",index=True)
    employee_id:Mapped[int|None]=mapped_column(ForeignKey("employees.id",ondelete="SET NULL"),nullable=True)
    is_active:Mapped[bool]=mapped_column(Boolean,default=True)
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class RolePermission(Base):
    __tablename__="role_permissions"
    id:Mapped[int]=mapped_column(primary_key=True)
    role_name:Mapped[str]=mapped_column(String(30),index=True)
    permission_code:Mapped[str]=mapped_column(String(80),index=True)
    __table_args__=(UniqueConstraint("role_name","permission_code"),)

class EmployeePermission(Base):
    __tablename__="employee_permissions"
    id:Mapped[int]=mapped_column(primary_key=True)
    employee_id:Mapped[int]=mapped_column(ForeignKey("employees.id",ondelete="CASCADE"))
    permission_code:Mapped[str]=mapped_column(String(80),index=True)
    allowed:Mapped[bool]=mapped_column(Boolean,default=True)
    __table_args__=(UniqueConstraint("employee_id","permission_code"),)
