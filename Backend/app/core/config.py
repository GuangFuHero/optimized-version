"""Application configuration loaded from environment variables and .env file."""

import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and the .env file."""

    # 資料庫連線字串
    # Docker 內部連線預設: postgresql+asyncpg://postgres:postgres@db:5432/postgres
    # 本地開發連線預設: postgresql+asyncpg://postgres:postgres@localhost:5432/postgres
    SQLALCHEMY_DATABASE_URL: str = os.getenv(
        "SQLALCHEMY_DATABASE_URL", 
        "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    )

    # JWT 密鑰
    # 注意：在生產環境中，建議每 90-180 天輪替此密鑰以提高安全性。
    # 正式環境一律從外部 Secret Manager 注入。
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-for-local-dev")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15            # short-lived access token
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14              # refresh token lifetime (Redis TTL)

    # Redis 連線字串
    # Docker 內部連線預設: redis://redis:6379
    # 本地開發連線預設: redis://localhost:6379
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    EMAIL_PROVIDER: str = os.getenv("EMAIL_PROVIDER", "console")  # console | brevo
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "no-reply@disaster-rescue.local")
    EMAIL_FROM_NAME: str = os.getenv("EMAIL_FROM_NAME", "Disaster Rescue")
    BREVO_API_KEY: str = os.getenv("BREVO_API_KEY", "")
    APP_BASE_URL: str = os.getenv("APP_BASE_URL", "http://localhost:3000")
    EMAIL_VERIFY_TTL_SECONDS: int = 1800  # 30 min

    @property
    def JWT_SIGNING_KEY(self) -> str:
        """將原始 SECRET_KEY 進行 SHA-256 雜湊，產生更強大的簽名密鑰。"""
        import hashlib
        return hashlib.sha256(self.SECRET_KEY.encode()).hexdigest()

    # 環境設定 (development, staging, production)
    ENV: str = os.getenv("ENV", "development")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )


settings = Settings()
