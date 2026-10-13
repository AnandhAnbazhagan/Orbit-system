from pydantic import BaseModel
from datetime import date
class ProjectCreate(BaseModel): project_code:str; name:str; description:str|None=None; client:str|None=None; manager_id:int|None=None; team_id:int|None=None; start_date:date|None=None; deadline:date|None=None; status:str="PLANNED"; priority:str="MEDIUM"; budget:float|None=None
class TaskCreate(BaseModel): project_id:int|None=None; title:str; description:str|None=None; assigned_employee_id:int|None=None; priority:str="MEDIUM"; status:str="TODO"; start_date:date|None=None; deadline:date|None=None; estimated_hours:float|None=None; actual_hours:float|None=None
class TeamCreate(BaseModel): name:str; department:str|None=None; leader_id:int|None=None; description:str|None=None; status:str="ACTIVE"
class InventoryCreate(BaseModel): item_name:str; sku:str; category:str|None=None; description:str|None=None; quantity:int=0; minimum_stock:int=0; unit:str="pcs"; location:str|None=None; supplier:str|None=None; purchase_price:float|None=None
class StockRequest(BaseModel): item_id:int; quantity:int; notes:str|None=None; from_location:str|None=None; to_location:str|None=None
class PermissionUpdate(BaseModel): permissions:list[str]
