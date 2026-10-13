
import logging
import sys

from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.models.user import User
from app.core.security import hash_password, verify_password


# =========================================================
# CONFIGURATION
# =========================================================

CEO_EMAIL = "ceo@orbit.example"
CEO_EMAIL = "Manager@orbit.example"
CEO_EMAIL = "admin@orbit.example"
CEO_EMAIL = "Director@orbit.example"
CEO_EMAIL = "Employee@orbit.example"

NEW_PASSWORD = "Orbit@123"

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s",
)

logger = logging.getLogger("orbit.password_reset")


# =========================================================
# RESET CEO PASSWORD
# =========================================================

def reset_ceo_password() -> int:
    db = SessionLocal()

    try:
        # Find the existing CEO account.
        user = (
            db.query(User)
            .filter(User.email.ilike(CEO_EMAIL))
            .first()
        )

        if user is None:
            logger.error(
                "CEO account not found: %s",
                CEO_EMAIL,
            )
            logger.info(
                "No records were changed. Check the database "
                "configuration and run seed.py if appropriate."
            )
            return 1

        # Generate a new bcrypt password hash.
        new_hash = hash_password(NEW_PASSWORD)

        # Verify the generated hash before saving it.
        if not verify_password(NEW_PASSWORD, new_hash):
            logger.error(
                "Password hash verification failed. "
                "No changes were committed."
            )
            return 1

        # Update only the existing CEO account.
        user.password_hash = new_hash

        db.commit()

        logger.info("CEO password reset successfully.")
        logger.info("Login email: %s", CEO_EMAIL)
        logger.info("Password: %s", NEW_PASSWORD)
        logger.info(
            "No other user accounts were intentionally modified."
        )

        return 0

    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "Database error while resetting the CEO password."
        )
        return 1

    except Exception:
        db.rollback()
        logger.exception(
            "Unexpected error while resetting the CEO password."
        )
        return 1

    finally:
        db.close()


# =========================================================
# ENTRY POINT
# =========================================================

if __name__ == "__main__":
    sys.exit(reset_ceo_password())
