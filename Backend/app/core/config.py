"""Application configuration loaded from environment variables and .env file."""

import ipaddress
import os

from pydantic import Field
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
        "SQLALCHEMY_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    )

    # JWT 密鑰
    # 注意：在生產環境中，建議每 90-180 天輪替此密鑰以提高安全性。
    # 正式環境一律從外部 Secret Manager 注入。
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-for-local-dev")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # short-lived access token
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14  # refresh token lifetime (Redis TTL)
    # How long a rotated refresh token still yields the token it was rotated into (ADR-330); 0 turns it off.
    REFRESH_REUSE_GRACE_SECONDS: int = 30

    # The browser's sign-in cookies (ADR-326). Every name starts with the prefix — `wg` in production,
    # `wgstg` on staging, `wgdev` on a developer's machine — so no environment reads or clears another's.
    # The default is the developer's, never production's: an environment that forgets to set it cannot end
    # up answering to production's cookies.
    AUTH_COOKIE_PREFIX: str = os.getenv("AUTH_COOKIE_PREFIX", "wgdev")
    # The parent domain of the site and the back office, so one sign-in reaches both (`.wan-guard.com`,
    # on staging too). Empty sends no Domain: the cookie stays on the one host, as on localhost.
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
    # The backend runs the Google and LINE sign-in itself (ADR-331), so the client secrets live here and
    # nowhere else. Left empty, that provider's sign-in is refused at its start.
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

    LINE_CHANNEL_ID: str = os.getenv("LINE_CHANNEL_ID", "")
    LINE_CHANNEL_SECRET: str = os.getenv("LINE_CHANNEL_SECRET", "")

    # Keys for TGOS 全國門牌位置比對服務 (ADDR) and 坐標回傳門牌服務 (GEO), set only in a .env file.
    # Left empty, every address lookup answers "unavailable".
    TGOS_ADDR_APP_ID: str = os.getenv("TGOS_ADDR_APP_ID", "")
    TGOS_ADDR_API_KEY: str = os.getenv("TGOS_ADDR_API_KEY", "")
    TGOS_GEO_APP_ID: str = os.getenv("TGOS_GEO_APP_ID", "")
    TGOS_GEO_API_KEY: str = os.getenv("TGOS_GEO_API_KEY", "")

    # Where a Google or LINE sign-in sends the browser back to: the site's or the back office's own URL,
    # by the `app` it was started for (ADR-331). Local values by default, like APP_BASE_URL.
    SITE_APP_URL: str = os.getenv("SITE_APP_URL", "http://localhost:3000")
    ADMIN_APP_URL: str = os.getenv("ADMIN_APP_URL", "http://localhost:3001")
    # The host each provider is registered to call back, the site's: one redirect URI per provider, for
    # both apps (ADR-331).
    OAUTH_REDIRECT_BASE_URL: str = os.getenv("OAUTH_REDIRECT_BASE_URL", "http://localhost:3000")
    # The peers whose `X-Forwarded-For` is believed: comma-separated addresses or CIDRs. The default is
    # loopback and the private ranges, where the site's proxy reaches the backend over the docker network.
    TRUSTED_PROXIES: str = os.getenv(
        "TRUSTED_PROXIES", "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"
    )
    # The public URL MCP clients reach this backend at; the MCP endpoint and its OAuth paths are under
    # `{MCP_BASE_URL}/mcp`, so it can be the site's own URL.
    MCP_BASE_URL: str = os.getenv("MCP_BASE_URL", "http://localhost:8000")
    # Limits on the MCP. Each must be above zero, so a wrong value stops the backend at startup instead of
    # leaving the MCP without that limit.
    # Sandbox execution time per CodeMode `execute`, in seconds; time waiting on backend calls or for a
    # worker is not counted.
    MCP_EXECUTE_SECONDS: float = Field(15.0, gt=0, allow_inf_nan=False)
    # Sandbox memory per `execute`, in bytes.
    MCP_EXECUTE_MEMORY_BYTES: int = Field(100_000_000, gt=0)
    # Sandbox worker processes shared by the app; each user holds at most one at a time.
    MCP_SANDBOX_WORKERS: int = Field(2, gt=0)
    # How long an `execute` waits for a free worker before it is refused as busy, in seconds.
    MCP_SANDBOX_WAIT_SECONDS: float = Field(10.0, gt=0, allow_inf_nan=False)
    # Executes each user may start per window of seconds.
    MCP_EXECUTES_PER_USER: int = Field(10, gt=0)
    MCP_EXECUTE_WINDOW_SECONDS: int = Field(60, gt=0)
    # Client registrations (`/mcp/register`) each IP may make per window of seconds.
    MCP_REGISTERS_PER_IP: int = Field(10, gt=0)
    MCP_REGISTER_WINDOW_SECONDS: int = Field(3600, gt=0)
    # Sign-in starts (`/mcp/authorize`) each IP may make per window of seconds.
    MCP_AUTHORIZES_PER_IP: int = Field(30, gt=0)
    MCP_AUTHORIZE_WINDOW_SECONDS: int = Field(600, gt=0)
    # Registered clients kept while waiting for their first sign-in; past it the oldest are forgotten.
    MCP_MAX_WAITING_CLIENTS: int = Field(1000, gt=0)
    # Tool calls one `execute` may make.
    MCP_MAX_TOOL_CALLS: int = Field(50, gt=0)
    # How long one backend call from a tool may take, in seconds.
    MCP_CALL_TIMEOUT_SECONDS: float = Field(30.0, gt=0, allow_inf_nan=False)
    # Characters a GraphQL document from a tool may have; it is refused before parsing beyond that.
    MCP_QUERY_MAX_CHARS: int = Field(20_000, gt=0)
    # What one client registration may carry: name length, redirect URIs, and its whole size in bytes.
    MCP_CLIENT_NAME_MAX_CHARS: int = Field(100, gt=0)
    MCP_MAX_REDIRECT_URIS: int = Field(5, gt=0)
    MCP_REGISTRATION_MAX_BYTES: int = Field(8192, gt=0)
    # Seconds a registered client is kept before its first sign-in; one that signs in lives as long as a
    # session.
    MCP_UNUSED_CLIENT_SECONDS: int = Field(3600, gt=0)
    # Seconds a started sign-in waits on the consent page, and an authorization code stays valid.
    MCP_AUTHORIZE_REQUEST_SECONDS: int = Field(600, gt=0)
    MCP_CODE_SECONDS: int = Field(300, gt=0)

    @property
    def trusted_proxy_networks(self) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
        """`TRUSTED_PROXIES` parsed into networks."""
        return tuple(
            ipaddress.ip_network(entry.strip(), strict=False)
            for entry in self.TRUSTED_PROXIES.split(",")
            if entry.strip()
        )

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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True)


settings = Settings()
