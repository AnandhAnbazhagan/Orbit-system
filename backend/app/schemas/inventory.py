from pydantic import BaseModel
class InventoryCreate(BaseModel):
    item_name:str; sku:str; category:str|None=None; description:str|None=None; quantity:int=0; minimum_stock:int=0; unit:str='pcs'; location:str|None=None; supplier:str|None=None; purchase_price:float|None=None
class StockRequest(BaseModel):
    item_id:int; quantity:int; notes:str|None=None; from_location:str|None=None; to_location:str|None=None
