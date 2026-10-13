from sqlalchemy import String,Integer,Date,DateTime,Boolean,ForeignKey
from sqlalchemy.orm import Mapped,mapped_column
from datetime import datetime
from ..database import Base
class Employee(Base):
    __tablename__="employees"
    id:Mapped[int]=mapped_column(primary_key=True)
    employee_id:Mapped[str]=mapped_column(String(40),unique=True,index=True)
    first_name:Mapped[str]=mapped_column(String(100)); last_name:Mapped[str]=mapped_column(String(100))
    email:Mapped[str]=mapped_column(String(255),unique=True,index=True); phone:Mapped[str|None]=mapped_column(String(30),nullable=True)
    department:Mapped[str|None]=mapped_column(String(100),nullable=True); designation:Mapped[str|None]=mapped_column(String(100),nullable=True)
    joining_date:Mapped[Date|None]=mapped_column(Date,nullable=True); reporting_manager_id:Mapped[int|None]=mapped_column(ForeignKey("employees.id",ondelete="SET NULL"),nullable=True)
    employment_type:Mapped[str|None]=mapped_column(String(50),nullable=True); profile_image:Mapped[str|None]=mapped_column(String(500),nullable=True)
    status:Mapped[str]=mapped_column(String(30),default="ACTIVE",index=True); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow); updated_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
