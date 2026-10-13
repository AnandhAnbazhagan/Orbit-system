from fastapi import APIRouter,Depends
from ..core.security import get_current_user
router=APIRouter(prefix="/api/settings",tags=["Settings"])
@router.get("")
def settings(user=Depends(get_current_user)): return {"organization":"Orbit system","role":user.role_name,"modules":["projects","tasks","teams","employees","inventory","chat","reports"]}
