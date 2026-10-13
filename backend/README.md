# Orbit system backend

FastAPI REST backend for Orbit system.

Run from this directory:
`uvicorn app.main:app --reload --port 8000`

The API creates SQLAlchemy tables at startup for local development. For production, introduce Alembic migrations before deployment.
