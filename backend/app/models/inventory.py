from sqlalchemy import String,Integer,Text,DateTime,ForeignKey,Numeric
from sqlalchemy.orm import Mapped,mapped_column
from datetime import datetime
from ..database import Base
class InventoryItem(Base):
    __tablename__="inventory_items"
    id:Mapped[int]=mapped_column(primary_key=True); item_name:Mapped[str]=mapped_column(String(200)); sku:Mapped[str]=mapped_column(String(80),unique=True,index=True); category:Mapped[str|None]=mapped_column(String(100)); description:Mapped[str|None]=mapped_column(Text); quantity:Mapped[int]=mapped_column(Integer,default=0); minimum_stock:Mapped[int]=mapped_column(Integer,default=0); unit:Mapped[str]=mapped_column(String(30),default="pcs"); location:Mapped[str|None]=mapped_column(String(120)); supplier:Mapped[str|None]=mapped_column(String(200)); purchase_price:Mapped[float|None]=mapped_column(Numeric(14,2)); status:Mapped[str]=mapped_column(String(30),default="AVAILABLE",index=True); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow); updated_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
class InventoryTransaction(Base):
    __tablename__="inventory_transactions"
    id:Mapped[int]=mapped_column(primary_key=True); item_id:Mapped[int]=mapped_column(ForeignKey("inventory_items.id",ondelete="CASCADE")); transaction_type:Mapped[str]=mapped_column(String(30)); quantity:Mapped[int]=mapped_column(Integer); from_location:Mapped[str|None]=mapped_column(String(120)); to_location:Mapped[str|None]=mapped_column(String(120)); performed_by:Mapped[int|None]=mapped_column(ForeignKey("users.id",ondelete="SET NULL")); notes:Mapped[str|None]=mapped_column(Text); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
