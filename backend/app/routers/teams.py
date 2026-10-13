
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.team import Team
from ..schemas.common import TeamCreate
from ..core.permissions import require_permission


router = APIRouter(
    prefix="/api/teams",
    tags=["Teams"]
)


# ============================================================
# LIST TEAMS
# ============================================================

@router.get("")
def list_teams(
    db: Session = Depends(get_db),
    user=Depends(require_permission("VIEW_DASHBOARD"))
):
    teams = db.query(Team).order_by(Team.id.desc()).all()

    return [
        {
            column.name: getattr(team, column.name)
            for column in Team.__table__.columns
        }
        for team in teams
    ]


# ============================================================
# CREATE TEAM
# ============================================================

@router.post("")
def create_team(
    data: TeamCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_TEAMS"))
):
    team_data = data.model_dump()

    team = Team(**team_data)

    db.add(team)
    db.commit()
    db.refresh(team)

    return {
        "message": "Team created successfully",
        "id": team.id,
        "name": team.name
    }


# ============================================================
# UPDATE TEAM
# ============================================================

@router.put("/{id}")
def update_team(
    id: int,
    data: TeamCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_TEAMS"))
):
    team = db.get(Team, id)

    if not team:
        raise HTTPException(
            status_code=404,
            detail="Team not found"
        )

    team_data = data.model_dump()

    for field, value in team_data.items():
        setattr(team, field, value)

    db.commit()
    db.refresh(team)

    return {
        "message": "Team updated successfully",
        "id": team.id,
        "name": team.name
    }


# ============================================================
# DELETE TEAM
# ============================================================

@router.delete("/{id}")
def delete_team(
    id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("MANAGE_TEAMS"))
):
    team = db.get(Team, id)

    if not team:
        raise HTTPException(
            status_code=404,
            detail="Team not found"
        )

    db.delete(team)
    db.commit()

    return {
        "message": "Team deleted successfully"
    }