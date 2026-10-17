"""Application configuration loaded from environment variables and .env file."""

import os

from pydantic_settings import BaseSettings, SettingsConfigDict


def normalise_origin(origin: str) -> str:
    """An origin as it is compared (ADR-327): trimmed, lower-case, without a trailing slash.

    Both the allowlist and the `Origin` a request carries go through this, so the two can only match
    or differ on what actually matters.
    """
    return origin.strip().lower().rstrip("/")


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
    # How long a rotated refresh token still yields the token it was rotated into (ADR-330); 0 turns it off.
    REFRESH_REUSE_GRACE_SECONDS: int = 30

    # The browser's sign-in cookies (ADR-326). Every name starts with the prefix — `wg` in production,
    # `wgstg` on staging, `wgdev` on a developer's machine — so no environment reads or clears another's.
    # The default is the developer's, never production's: an environment that forgets to set it cannot end
    # up answering to production's cookies.
    AUTH_COOKIE_PREFIX: str = os.getenv("AUTH_COOKIE_PREFIX", "wgdev")
    # The parent domain of the site and the back office, so one sign-in reaches both
    # (`.staging.wan-guard.com`). Empty sends no Domain: the cookie stays on the one host, as on localhost.
    AUTH_COOKIE_DOMAIN: str = os.getenv("AUTH_COOKIE_DOMAIN", "")
    # Deliberately not derived from ENV, which counts as production when unset; a developer serving over
    # plain http sets it to false.
    AUTH_COOKIE_SECURE: bool = True
    # The pages allowed to send a cookie-authenticated write (ADR-327): comma-separated origins. The default
    # names only the two local apps, so an environment that forgets it refuses every such write instead
    # of accepting some it should not.
    AUTH_ALLOWED_ORIGINS: str = os.getenv(
        "AUTH_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001"
    )

    # Redis 連線字串
    # Docker 內部連線預設: redis://redis:6379
    # 本地開發連線預設: redis://localhost:6379
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    EMAIL_PROVIDER: str = os.getenv("EMAIL_PROVIDER", "console")  # console | smtp2go
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "no-reply@disaster-rescue.local")
    EMAIL_FROM_NAME: str = os.getenv("EMAIL_FROM_NAME", "Disaster Rescue")
    APP_BASE_URL: str = os.getenv("APP_BASE_URL", "http://localhost:3000")

    PHONE_DEFAULT_REGION: str = os.getenv("PHONE_DEFAULT_REGION", "TW")
    OTP_TTL_SECONDS: int = 600  # 10 min, unified email+phone code TTL
    SMS_PROVIDER: str = os.getenv("SMS_PROVIDER", "console")  # console | kotsms
    SMTP2GO_API_KEY: str = os.getenv("SMTP2GO_API_KEY", "")
    # 簡訊王 API 認證用的就是網頁登入的那組帳密（帳號在會員區「基本資料 → 您的帳號名稱」）。
    KOTSMS_USERNAME: str = os.getenv("KOTSMS_USERNAME", "")
    KOTSMS_PASSWORD: str = os.getenv("KOTSMS_PASSWORD", "")

    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

    LINE_CHANNEL_ID: str = os.getenv("LINE_CHANNEL_ID", "")

    @property
    def allowed_origins(self) -> frozenset[str]:
        """`AUTH_ALLOWED_ORIGINS` as a set, written the way a browser sends `Origin`.

        Kept as a plain string field and split here because pydantic-settings reads a list field from
        the environment as JSON, which would reject a comma-separated value. Entries are filtered after
        `normalise_origin`, so a stray `/` cannot leave an empty origin in the set for a request without
        one to match.
        """
        normalised = (normalise_origin(origin) for origin in self.AUTH_ALLOWED_ORIGINS.split(","))
        return frozenset(origin for origin in normalised if origin)

    @property
    def JWT_SIGNING_KEY(self) -> str:
        """將原始 SECRET_KEY 進行 SHA-256 雜湊，產生更強大的簽名密鑰。"""
        import hashlib
        return hashlib.sha256(self.SECRET_KEY.encode()).hexdigest()

    # 環境設定 (development, testing, staging, production)。未設定時視為 production，開發用的功能預設關閉。
    ENV: str = os.getenv("ENV", "production")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )


settings = Settings()
