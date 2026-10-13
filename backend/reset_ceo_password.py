
import logging
import sys

from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.models.user import User
from app.core.security import hash_password, verify_password

CEO_EMAIL = "ceo@orbit.example"
NEW_PASSWORD = "Orbit@123"

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def reset_ceo_password():
    db = SessionLocal()

    try:
        user = (
            db.query(User)
            .filter(User.email.ilike(CEO_EMAIL))
            .first()
        )

        if user is None:
            print("ERROR: CEO account not found in the connected database.")
            print("Check your database configuration and run seed.py if needed.")
            return 1

        new_hash = hash_password(NEW_PASSWORD)

        if not verify_password(NEW_PASSWORD, new_hash):
            print("ERROR: Password verification failed.")
            return 1

        user.password_hash = new_hash
        db.commit()

        print("CEO password reset successfully!")
        print("Email: ceo@orbit.example")
        print("Password: Orbit@123")
        print("Now try logging in again.")
        return 0

    except SQLAlchemyError:
        db.rollback()
        logging.exception("Database error")
        return 1

    except Exception:
        db.rollback()
        logging.exception("Unexpected error")
        return 1

    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(reset_ceo_password())