from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


ProjectStatus = Literal[
    "PLANNED",
    "IN_PROGRESS",
    "ON_HOLD",
    "COMPLETED",
    "CANCELLED",
]

ProjectPriority = Literal[
    "LOW",
    "MEDIUM",
    "HIGH",
    "URGENT",
]


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)

    description: str | None = None
    client: str | None = None

    manager_id: int | None = Field(default=None, gt=0)
    team_id: int | None = Field(default=None, gt=0)

    start_date: date | None = None
    deadline: date | None = None

    status: ProjectStatus = "PLANNED"
    priority: ProjectPriority = "MEDIUM"
    budget: float | None = Field(default=None, ge=0)

    # Accepted for compatibility; progress is derived from tasks.
    progress: int | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def validate_dates(self):
        if (
            self.start_date is not None
            and self.deadline is not None
            and self.deadline < self.start_date
        ):
            raise ValueError(
                "Project deadline cannot be before the start date."
            )

        if not self.project_code.strip():
            raise ValueError("Project code cannot be empty.")

        if not self.name.strip():
            raise ValueError("Project name cannot be empty.")

        return self


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    project_code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=200)

    description: str | None = None
    client: str | None = None

    manager_id: int | None = Field(default=None, gt=0)
    team_id: int | None = Field(default=None, gt=0)

    start_date: date | None = None
    deadline: date | None = None

    status: ProjectStatus | None = None
    priority: ProjectPriority | None = None
    budget: float | None = Field(default=None, ge=0)

    # Ignored by the router; task completion determines progress.
    progress: int | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def validate_dates(self):
        if (
            self.start_date is not None
            and self.deadline is not None
            and self.deadline < self.start_date
        ):
            raise ValueError(
                "Project deadline cannot be before the start date."
            )

        return self