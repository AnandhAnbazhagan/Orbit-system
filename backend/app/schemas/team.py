from pydantic import BaseModel
class TeamCreate(BaseModel):
    name:str; department:str|None=None; leader_id:int|None=None; description:str|None=None; status:str='ACTIVE'
