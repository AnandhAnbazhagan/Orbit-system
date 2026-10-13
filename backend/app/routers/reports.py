from fastapi import APIRouter,Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..core.permissions import require_permission
from ..models.project import Project
from ..models.task import Task
from ..models.employee import Employee
from ..models.inventory import InventoryItem
router=APIRouter(prefix="/api/reports",tags=["Reports"])
@router.get("/projects")
def projects(db:Session=Depends(get_db),user=Depends(require_permission("VIEW_REPORTS"))): return {"by_status":dict(db.query(Project.status,func.count(Project.id)).group_by(Project.status).all())}
@router.get("/tasks")
def tasks(db:Session=Depends(get_db),user=Depends(require_permission("VIEW_REPORTS"))): return {"by_status":dict(db.query(Task.status,func.count(Task.id)).group_by(Task.status).all())}
@router.get("/employees")
def employees(db:Session=Depends(get_db),user=Depends(require_permission("VIEW_REPORTS"))): return {"by_department":dict(db.query(Employee.department,func.count(Employee.id)).group_by(Employee.department).all())}
@router.get("/inventory")
def inventory(db:Session=Depends(get_db),user=Depends(require_permission("VIEW_REPORTS"))): return {"by_status":dict(db.query(InventoryItem.status,func.count(InventoryItem.id)).group_by(InventoryItem.status).all())}
