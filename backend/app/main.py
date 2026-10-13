from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# =========================================================
# IMPORT ROUTERS
# =========================================================

from app.routers import (
    auth,
    dashboard,
    employees,
    projects,
    tasks,
    teams,
    inventory,
    chat,
    reports,
    notifications,
    settings,
)

# =========================================================
# CREATE FASTAPI APPLICATION FIRST
# =========================================================

app = FastAPI(
    title="Orbit System API",
    description=(
        "Enterprise Project Management, Employee Management, "
        "Inventory Management and Communication System"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# =========================================================
# CORS CONFIGURATION
# Allows the separate frontend to call the backend.
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# REGISTER API ROUTERS
# IMPORTANT: app must exist before include_router().
# =========================================================

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(employees.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(teams.router)
app.include_router(inventory.router)
app.include_router(chat.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(settings.router)

# =========================================================
# ROOT ENDPOINT
# =========================================================

@app.get("/", tags=["System"])
def root():
    return {
        "success": True,
        "application": "Orbit System",
        "message": "Orbit System API is running",
        "documentation": "/docs",
        "dashboard": "/api/dashboard",
    }

# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health", tags=["System"])
def health_check():
    return {
        "success": True,
        "status": "healthy",
        "application": "Orbit System API",
    }