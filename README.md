# Orbit system

Enterprise Project Management + Employee Management + Inventory Management + Communication System.

## Architecture
- `frontend/`: standalone HTML5/CSS3/Vanilla JS, served by VS Code Live Server. It communicates only with REST endpoints.
- `backend/`: FastAPI + SQLAlchemy + MySQL/PyMySQL, JWT security and permission enforcement.
- `backend/uploads/`: local file storage designed so the storage layer can later be replaced by S3-compatible storage.

## Requirements
- Python 3.12+
- MySQL 8+
- VS Code + Live Server

## MySQL
1. Create a MySQL user/database or run `backend/schema.sql` as root.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and `JWT_SECRET`.

## Backend
```powershell
cd "Orbit system\backend"
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python seed.py
uvicorn app.main:app --reload --port 8000
```
Swagger: http://127.0.0.1:8000/docs

## Frontend
Open `frontend/` with VS Code Live Server. Recommended URL: http://127.0.0.1:5500/frontend/login.html

## Demo users
All seeded users use password `Orbit@123`:
- CEO: ceo@orbit.local
- DIRECTOR: director@orbit.local
- ADMIN: admin@orbit.local
- MANAGER: manager@orbit.local
- EMPLOYEE: employee@orbit.local

CEO and DIRECTOR are stored internally as `EXECUTIVE`, giving identical access. ADMIN is fully privileged by backend policy and can register employees/manage access.

## Security
Passwords are bcrypt-hashed. JWTs protect APIs. Backend permissions are authoritative; frontend controls are only presentation. SQLAlchemy parameterization protects against SQL injection. Uploads validate MIME type and size and use generated filenames.

## Chat storage
Images/documents are saved under `backend/uploads/chat/`. MySQL stores only file metadata/path through `chat_messages` and `files`. The `/uploads` static mount is intended for local development; production should put an authenticated/object-storage layer in front of private files.

## Extending
Add SQLAlchemy models under `backend/app/models`, Pydantic schemas under `schemas`, REST routers under `routers`, and corresponding page/controller modules under `frontend/pages` and `frontend/js`.

## Troubleshooting
- CORS: ensure `FRONTEND_ORIGINS` includes the exact Live Server origin.
- Database: verify MySQL is running, database exists, and `.env` credentials are correct.
- 401: log in again and ensure the token exists in browser localStorage.
- 403: assign the required backend permission/role.
- Upload errors: verify file type/size against `MAX_UPLOAD_MB`.

## Production deployment
Use HTTPS, a reverse proxy, secret manager, proper database migrations (Alembic), object storage for uploads, refresh-token strategy, rate limiting, structured logging, CSRF strategy where applicable, and a dedicated frontend host/CDN.
