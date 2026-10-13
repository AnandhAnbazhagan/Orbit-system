
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.inventory import InventoryItem, InventoryTransaction
from ..schemas.common import InventoryCreate, StockRequest
from ..core.permissions import require_permission


router = APIRouter(
    prefix="/api/inventory",
    tags=["Inventory"],
)


# =========================================================
# REQUEST SCHEMA: STATUS UPDATE
# =========================================================

class InventoryStatusUpdate(BaseModel):
    status: Literal[
        "AVAILABLE",
        "LOW_STOCK",
        "OUT_OF_STOCK",
        "INACTIVE",
    ]


# =========================================================
# SERIALIZE INVENTORY ITEM
# =========================================================

def serialize_item(item: InventoryItem) -> dict:
    return {
        "id": item.id,
        "item_name": item.item_name,
        "sku": item.sku,
        "category": item.category,
        "description": item.description,
        "quantity": item.quantity,
        "minimum_stock": item.minimum_stock,
        "unit": item.unit,
        "location": item.location,
        "supplier": item.supplier,
        "purchase_price": (
            float(item.purchase_price)
            if item.purchase_price is not None
            else None
        ),
        "status": item.status,
    }


# =========================================================
# CALCULATE AUTOMATIC STOCK STATUS
# =========================================================

def refresh_status(item: InventoryItem) -> None:
    """
    INACTIVE is a manually controlled status.
    Active stock statuses are calculated from quantity.
    """
    if item.status == "INACTIVE":
        return

    if item.quantity <= 0:
        item.status = "OUT_OF_STOCK"
    elif item.quantity <= item.minimum_stock:
        item.status = "LOW_STOCK"
    else:
        item.status = "AVAILABLE"


# =========================================================
# VALIDATE INVENTORY INPUT
# =========================================================

def validate_inventory(data: InventoryCreate) -> None:
    if not data.item_name or not data.item_name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Item name is required.",
        )

    if not data.sku or not data.sku.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="SKU is required.",
        )

    if data.quantity < 0 or data.minimum_stock < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Quantity and minimum stock cannot be negative.",
        )

    if (
        data.purchase_price is not None
        and data.purchase_price < 0
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Purchase price cannot be negative.",
        )


# =========================================================
# GET ALL INVENTORY ITEMS
# GET /api/inventory
# =========================================================

@router.get("")
def list_inventory(
    db: Session = Depends(get_db),
    user=Depends(require_permission("VIEW_DASHBOARD")),
):
    try:
        items = (
            db.query(InventoryItem)
            .order_by(InventoryItem.id.desc())
            .all()
        )

        result = []

        for item in items:
            # Compute the response status without changing
            # the persisted item during a GET request.
            saved_status = item.status

            refresh_status(item)

            result.append(serialize_item(item))

            item.status = saved_status

        return result

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail="Unable to load inventory items.",
        )


# =========================================================
# ADD INVENTORY ITEM
# POST /api/inventory
# =========================================================

@router.post("", status_code=status.HTTP_201_CREATED)
def create_inventory(
    data: InventoryCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_INVENTORY")),
):
    validate_inventory(data)

    try:
        sku = data.sku.strip()

        existing_item = (
            db.query(InventoryItem)
            .filter(InventoryItem.sku == sku)
            .first()
        )

        if existing_item:
            raise HTTPException(
                status_code=409,
                detail="An inventory item with this SKU already exists.",
            )

        item_data = data.model_dump()
        item_data["item_name"] = data.item_name.strip()
        item_data["sku"] = sku

        item = InventoryItem(**item_data)

        # New items receive their calculated stock status.
        item.status = "AVAILABLE"
        refresh_status(item)

        db.add(item)
        db.commit()
        db.refresh(item)

        return serialize_item(item)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The item could not be saved. Check for duplicate SKU values.",
        )

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Database error while adding the inventory item.",
        )


# =========================================================
# UPDATE INVENTORY ITEM
# PUT /api/inventory/{id}
# =========================================================

@router.put("/{id}")
def update_inventory(
    id: int,
    data: InventoryCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_INVENTORY")),
):
    validate_inventory(data)

    try:
        item = db.get(InventoryItem, id)

        if item is None:
            raise HTTPException(
                status_code=404,
                detail="Inventory item not found.",
            )

        sku = data.sku.strip()

        duplicate_sku = (
            db.query(InventoryItem)
            .filter(
                InventoryItem.sku == sku,
                InventoryItem.id != id,
            )
            .first()
        )

        if duplicate_sku:
            raise HTTPException(
                status_code=409,
                detail="Another inventory item already uses this SKU.",
            )

        # Preserve a manually assigned INACTIVE status when
        # editing the item's ordinary details.
        was_inactive = item.status == "INACTIVE"

        item_data = data.model_dump()
        item_data["item_name"] = data.item_name.strip()
        item_data["sku"] = sku

        for field, value in item_data.items():
            setattr(item, field, value)

        if was_inactive:
            item.status = "INACTIVE"
        else:
            refresh_status(item)

        db.commit()
        db.refresh(item)

        return serialize_item(item)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The item could not be updated because of a duplicate value.",
        )

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Database error while updating the inventory item.",
        )


# =========================================================
# UPDATE INVENTORY STATUS
# PATCH /api/inventory/{id}/status
# =========================================================

@router.patch("/{id}/status")
def update_inventory_status(
    id: int,
    data: InventoryStatusUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_INVENTORY")),
):
    try:
        item = db.get(InventoryItem, id)

        if item is None:
            raise HTTPException(
                status_code=404,
                detail="Inventory item not found.",
            )

        if data.status == "INACTIVE":
            # Persist the manual deactivation.
            item.status = "INACTIVE"
        else:
            # Activation restores the correct status based
            # on the current quantity and minimum stock.
            item.status = "AVAILABLE"
            refresh_status(item)

        db.commit()
        db.refresh(item)

        return serialize_item(item)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Unable to save the inventory status.",
        )

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Database error while updating inventory status.",
        )


# =========================================================
# DELETE INVENTORY ITEM
# DELETE /api/inventory/{id}
# =========================================================

@router.delete("/{id}")
def delete_inventory(
    id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_INVENTORY")),
):
    try:
        item = db.get(InventoryItem, id)

        if item is None:
            raise HTTPException(
                status_code=404,
                detail="Inventory item not found.",
            )

        db.delete(item)
        db.commit()

        return {
            "message": "Inventory item deleted successfully."
        }

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "This item cannot be deleted because it is "
                "referenced by other records."
            ),
        )

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Database error while deleting the inventory item.",
        )


# =========================================================
# STOCK IN
# POST /api/inventory/stock-in
# =========================================================

@router.post("/stock-in")
def stock_in(
    data: StockRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_INVENTORY")),
):
    if data.quantity <= 0:
        raise HTTPException(
            status_code=422,
            detail="Stock-in quantity must be greater than zero.",
        )

    try:
        item = db.get(InventoryItem, data.item_id)

        if item is None:
            raise HTTPException(
                status_code=404,
                detail="Inventory item not found.",
            )

        if item.status == "INACTIVE":
            raise HTTPException(
                status_code=409,
                detail="Activate this inventory item before adding stock.",
            )

        item.quantity += data.quantity
        refresh_status(item)

        transaction = InventoryTransaction(
            item_id=item.id,
            transaction_type="STOCK_IN",
            quantity=data.quantity,
            performed_by=user.id,
            notes=data.notes,
        )

        db.add(transaction)
        db.commit()
        db.refresh(item)

        return serialize_item(item)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Database error while recording stock-in.",
        )


# =========================================================
# STOCK OUT
# POST /api/inventory/stock-out
# =========================================================

@router.post("/stock-out")
def stock_out(
    data: StockRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_INVENTORY")),
):
    if data.quantity <= 0:
        raise HTTPException(
            status_code=422,
            detail="Stock-out quantity must be greater than zero.",
        )

    try:
        item = db.get(InventoryItem, data.item_id)

        if item is None:
            raise HTTPException(
                status_code=404,
                detail="Inventory item not found.",
            )

        if item.status == "INACTIVE":
            raise HTTPException(
                status_code=409,
                detail="Activate this inventory item before removing stock.",
            )

        if item.quantity < data.quantity:
            raise HTTPException(
                status_code=400,
                detail="Insufficient stock available.",
            )

        item.quantity -= data.quantity
        refresh_status(item)

        transaction = InventoryTransaction(
            item_id=item.id,
            transaction_type="STOCK_OUT",
            quantity=data.quantity,
            performed_by=user.id,
            notes=data.notes,
        )

        db.add(transaction)
        db.commit()
        db.refresh(item)

        return serialize_item(item)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Database error while recording stock-out.",
        )


# =========================================================
# TRANSFER STOCK
# POST /api/inventory/transfer
# =========================================================

@router.post("/transfer")
def transfer_stock(
    data: StockRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_INVENTORY")),
):
    if data.quantity <= 0:
        raise HTTPException(
            status_code=422,
            detail="Transfer quantity must be greater than zero.",
        )

    if not data.to_location or not data.to_location.strip():
        raise HTTPException(
            status_code=422,
            detail="Destination location is required.",
        )

    try:
        item = db.get(InventoryItem, data.item_id)

        if item is None:
            raise HTTPException(
                status_code=404,
                detail="Inventory item not found.",
            )

        if item.status == "INACTIVE":
            raise HTTPException(
                status_code=409,
                detail="Activate this inventory item before transferring stock.",
            )

        if item.quantity < data.quantity:
            raise HTTPException(
                status_code=400,
                detail="Insufficient stock available for transfer.",
            )

        source_location = data.from_location or item.location
        destination_location = data.to_location.strip()

        # This implementation tracks a single location per item.
        # It records the requested transfer quantity, but does not
        # maintain separate per-location quantity balances.
        item.location = destination_location

        transaction = InventoryTransaction(
            item_id=item.id,
            transaction_type="TRANSFER",
            quantity=data.quantity,
            from_location=source_location,
            to_location=destination_location,
            performed_by=user.id,
            notes=data.notes,
        )

        db.add(transaction)
        db.commit()
        db.refresh(item)

        return serialize_item(item)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Database error while recording the transfer.",
        )
