from urllib.parse import quote_plus

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


# ============================================================
# Database Configuration
# ============================================================

DB_HOST = "127.0.0.1"
DB_PORT = 3306
DB_NAME = "embsys_orbit"
DB_USER = "root"
DB_PASSWORD = "NewPassword@123"


# ============================================================
# Database URL
# ============================================================

# quote_plus() safely encodes special characters in the password.
# Example: @ becomes %40.
DATABASE_URL = (
    f"mysql+pymysql://"
    f"{quote_plus(DB_USER)}:"
    f"{quote_plus(DB_PASSWORD)}@"
    f"{DB_HOST}:{DB_PORT}/"
    f"{DB_NAME}"
)


# ============================================================
# SQLAlchemy Engine
# ============================================================

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=280,
    echo=False,
)


# ============================================================
# Database Session
# ============================================================

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


# ============================================================
# SQLAlchemy Base
# ============================================================

class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""

    pass


# ============================================================
# FastAPI Database Dependency
# ============================================================

def get_db():
    """
    Provides a database session for FastAPI requests.

    The session is automatically closed after the request,
    even if an exception occurs.
    """

    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
