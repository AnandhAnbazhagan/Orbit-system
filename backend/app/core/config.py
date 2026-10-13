from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    FRONTEND_ORIGINS: str = "http://127.0.0.1:5500,http://localhost:5500"
    MAX_UPLOAD_MB: int = 10
    BASE_DIR: Path = Path(__file__).resolve().parents[2]
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
