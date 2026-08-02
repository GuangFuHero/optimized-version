# Map Tile Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public tile proxy API (`/api/v1/map/tile` and `/api/v1/map/attribution`) that fetches map tiles from upstream sources, caches them in Redis for 7 days, and returns attribution metadata to the frontend.

**Architecture:** FastAPI async route handlers delegate to a `tile_proxy` service that checks Redis before fetching upstream via `httpx`. All tiles are cached as Redis hashes with a unified key format. Attribution data is a static registry — no DB involved.

**Tech Stack:** FastAPI, httpx (async HTTP), redis[asyncio], fakeredis (tests), Pydantic v2

**Design doc:** `Spec/Docs/map-tile-service-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docker-compose.yml` | Modify | Add Redis service |
| `pyproject.toml` | Modify | Add `redis[asyncio]`, move `httpx` to main deps, add `fakeredis` to dev |
| `app/core/config.py` | Modify | Add `REDIS_URL` setting |
| `app/main.py` | Modify | Add Redis startup/shutdown lifecycle |
| `app/schemas/map.py` | Create | `AttributionResponse` Pydantic model |
| `app/services/tile_proxy.py` | Create | Source registry, attribution registry, cache key builder, fetch+cache logic, blank tile |
| `app/api/v1/endpoints/map.py` | Create | Tile and attribution route handlers |
| `app/api/v1/api.py` | Modify | Register map router |
| `tests/test_map.py` | Create | Unit + integration tests |

---

## Task 1: Add Redis to Docker Compose and install dependencies

**Files:**
- Modify: `docker-compose.yml`
- Modify: `pyproject.toml`

- [ ] **Step 1: Add Redis to docker-compose.yml**

Replace the contents of `docker-compose.yml`:

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    volumes:
      - ./.db:/var/lib/postgresql/data
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    networks:
      - app-network

  backend:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - .:/app
    environment:
      - SQLALCHEMY_DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/postgres
      - SECRET_KEY=your-secret-key-for-local-dev
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

- [ ] **Step 2: Add runtime and dev dependencies to pyproject.toml**

In `pyproject.toml`, add `redis[asyncio]` and `httpx` to `dependencies`, and add `fakeredis` to `[dependency-groups].dev`:

```toml
dependencies = [
    "alembic>=1.18.0",
    "asyncpg>=0.31.0",
    "fastapi>=0.128.0",
    "geoalchemy2>=0.18.1",
    "greenlet>=3.3.1",
    "h3>=4.4.1",
    "httpx>=0.28.1",
    "line-bot-sdk>=3.21.0",
    "passlib[bcrypt]>=1.7.4",
    "bcrypt==4.0.1",
    "pydantic-settings>=2.12.0",
    "python-jose[cryptography]>=3.5.0",
    "python-multipart>=0.0.21",
    "redis[asyncio]>=5.0.0",
    "shapely>=2.1.2",
    "sqlalchemy>=2.0.45",
    "strawberry-graphql[fastapi]>=0.288.2",
    "uvicorn>=0.40.0",
    "pyrate-limiter>=4.1.0",
    "fastapi-limiter>=0.2.0",
]

[dependency-groups]
dev = [
    "fakeredis>=2.26.0",
    "pytest>=9.0.2",
    "pytest-asyncio>=1.3.0",
]
```

- [ ] **Step 3: Install dependencies**

```bash
cd /Users/hsunchao/personal_project/optimized-version/Backend
uv sync
```

Expected: Dependencies install without error.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml pyproject.toml
git commit -m "feat(map): add Redis to docker-compose and project dependencies"
```

---

## Task 2: Add REDIS_URL to config and Redis lifecycle to main.py

**Files:**
- Modify: `app/core/config.py`
- Modify: `app/main.py`

- [ ] **Step 1: Add REDIS_URL to config**

In `app/core/config.py`, add `REDIS_URL` inside the `Settings` class:

```python
import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SQLALCHEMY_DATABASE_URL: str = os.getenv(
        "SQLALCHEMY_DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    )

    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-for-local-dev")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    @property
    def JWT_SIGNING_KEY(self) -> str:
        import hashlib
        return hashlib.sha256(self.SECRET_KEY.encode()).hexdigest()

    ENV: str = os.getenv("ENV", "development")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )


settings = Settings()
```

- [ ] **Step 2: Add Redis startup/shutdown to main.py**

Replace `app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pyrate_limiter import Duration, Limiter, Rate
from strawberry.fastapi import GraphQLRouter
from app.api.v1.api import api_router
from app.graphql.context import get_context
from app.core.config import settings

app = FastAPI(
    title="救災平台 API",
    description="災難救援與資源調度平台後端服務",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    import os
    import redis.asyncio as aioredis

    env = os.getenv("ENV", "development")
    rate_val = 100 if env != "testing" else 999999
    app.state.limiter = Limiter(Rate(rate_val, Duration.MINUTE))

    app.state.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=False)


@app.on_event("shutdown")
async def shutdown():
    if hasattr(app.state, "redis"):
        await app.state.redis.aclose()


app.include_router(api_router, prefix="/api/v1")


def _get_graphql_router():
    from app.graphql.schema import schema
    return GraphQLRouter(schema, context_getter=get_context)

app.include_router(_get_graphql_router(), prefix="/graphql")


@app.get("/")
async def root():
    return {"message": "Welcome to Disaster Relief Platform API", "status": "online"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
```

- [ ] **Step 3: Verify app still starts**

```bash
cd /Users/hsunchao/personal_project/optimized-version/Backend
python -c "from app.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add app/core/config.py app/main.py
git commit -m "feat(map): add REDIS_URL config and Redis startup lifecycle"
```

---

## Task 3: Create AttributionResponse schema (TDD)

**Files:**
- Create: `app/schemas/map.py`
- Create: `tests/test_map.py` (initial skeleton)

- [ ] **Step 1: Write the failing test**

Create `tests/test_map.py`:

```python
import pytest
import os
os.environ["ENV"] = "testing"

from app.schemas.map import AttributionResponse


def test_attribution_response_valid():
    resp = AttributionResponse(
        source="nasa_gibs",
        type="satellite",
        name="NASA GIBS",
        license="US Gov Open Data",
        attribution_text="Imagery provided by NASA's Global Imagery Browse Services (GIBS), part of NASA's ESDIS",
        attribution_url="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs",
        image_format="image/jpeg",
        commercial_use=True,
        requires_logo=False,
        logo_url=None,
        notes=None,
    )
    assert resp.source == "nasa_gibs"
    assert resp.logo_url is None


def test_attribution_response_with_logo():
    resp = AttributionResponse(
        source="mapbox",
        type="road",
        name="Mapbox",
        license="Mapbox ToS",
        attribution_text="© Mapbox, © OpenStreetMap contributors",
        attribution_url="https://www.mapbox.com/about/maps/",
        image_format="image/png",
        commercial_use=True,
        requires_logo=True,
        logo_url="https://www.mapbox.com/mapbox-logo/",
        notes=None,
    )
    assert resp.requires_logo is True
    assert resp.logo_url == "https://www.mapbox.com/mapbox-logo/"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/hsunchao/personal_project/optimized-version/Backend
pytest tests/test_map.py::test_attribution_response_valid -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.map'`

- [ ] **Step 3: Create app/schemas/map.py**

```python
from typing import Optional
from pydantic import BaseModel


class AttributionResponse(BaseModel):
    source: str
    type: str
    name: str
    license: str
    attribution_text: str
    attribution_url: str
    image_format: str
    commercial_use: bool
    requires_logo: bool
    logo_url: Optional[str]
    notes: Optional[str]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_map.py::test_attribution_response_valid tests/test_map.py::test_attribution_response_with_logo -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add app/schemas/map.py tests/test_map.py
git commit -m "feat(map): add AttributionResponse schema"
```

---

## Task 4: Create tile_proxy — source registry, attribution registry, cache key (TDD)

**Files:**
- Create: `app/services/tile_proxy.py`
- Modify: `tests/test_map.py`

- [ ] **Step 1: Write failing tests for cache key builder and registry lookups**

Append to `tests/test_map.py`:

```python
from app.services.tile_proxy import build_cache_key, get_source_config, get_attribution, BLANK_TILE


def test_cache_key_no_params():
    key = build_cache_key("nasa_gibs", "satellite", 10, 123, 456, {})
    assert key == "tile:nasa_gibs:satellite:_:10:123:456"


def test_cache_key_with_one_param():
    key = build_cache_key("sinica", "satellite", 10, 1, 2, {"layer": "EARTH"})
    assert key == "tile:sinica:satellite:layer=EARTH:10:1:2"


def test_cache_key_params_sorted():
    key = build_cache_key("sinica", "satellite", 5, 0, 0, {"style": "default", "layer": "EARTH"})
    assert key == "tile:sinica:satellite:layer=EARTH,style=default:5:0:0"


def test_get_source_config_valid():
    config = get_source_config("satellite", "nasa_gibs")
    assert config is not None
    assert "{z}" in config.url_template
    assert config.image_format == "image/jpeg"


def test_get_source_config_invalid_combo():
    config = get_source_config("road", "nasa_gibs")
    assert config is None


def test_get_attribution_valid():
    attr = get_attribution("satellite", "nasa_gibs")
    assert attr is not None
    assert attr.source == "nasa_gibs"
    assert attr.commercial_use is True
    assert attr.requires_logo is False
    assert attr.logo_url is None


def test_get_attribution_invalid():
    attr = get_attribution("satellite", "carto")
    assert attr is None


def test_blank_tile_is_bytes():
    assert isinstance(BLANK_TILE, bytes)
    assert len(BLANK_TILE) > 0
    # Valid PNG starts with PNG magic bytes
    assert BLANK_TILE[:8] == b'\x89PNG\r\n\x1a\n'
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_map.py::test_cache_key_no_params -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.tile_proxy'`

- [ ] **Step 3: Create app/services/tile_proxy.py with registry, cache key, and blank tile**

```python
import base64
from dataclasses import dataclass, field
from typing import Optional

from app.schemas.map import AttributionResponse


# 1×1 transparent PNG (67 bytes)
BLANK_TILE = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAA"
    "IAAQAABjkB6QAAAABJRU5ErkJggg=="
)


@dataclass
class SourceConfig:
    url_template: str
    image_format: str
    headers: dict = field(default_factory=dict)


SOURCE_REGISTRY: dict[tuple[str, str], SourceConfig] = {
    ("satellite", "nasa_gibs"): SourceConfig(
        url_template=(
            "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
            "MODIS_Terra_CorrectedReflectance_TrueColor/default/"
            "GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg"
        ),
        image_format="image/jpeg",
    ),
    ("satellite", "eox"): SourceConfig(
        url_template=(
            "https://tiles.maps.eox.at/wmts/1.0.0/"
            "s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"
        ),
        image_format="image/jpeg",
    ),
    ("satellite", "nlsc"): SourceConfig(
        url_template="https://wmts.nlsc.gov.tw/wmts/PHOTO_MIX/default/EPSG:3857/{z}/{y}/{x}",
        image_format="image/png",
        headers={"Referer": "https://maps.nlsc.gov.tw/"},
    ),
    ("satellite", "sinica"): SourceConfig(
        url_template=(
            "https://gis.sinica.edu.tw/tileserver/file-exists.php"
            "?img={layer}/{z}/{x}/{y}"
        ),
        image_format="image/png",
    ),
    ("road", "osm"): SourceConfig(
        url_template="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        image_format="image/png",
    ),
    ("road", "carto"): SourceConfig(
        url_template="https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        image_format="image/png",
    ),
}

ATTRIBUTION_REGISTRY: dict[tuple[str, str], AttributionResponse] = {
    ("satellite", "nasa_gibs"): AttributionResponse(
        source="nasa_gibs",
        type="satellite",
        name="NASA GIBS",
        license="US Gov Open Data",
        attribution_text=(
            "Imagery provided by NASA's Global Imagery Browse Services (GIBS), "
            "part of NASA's ESDIS"
        ),
        attribution_url=(
            "https://earthdata.nasa.gov/eosdis/science-system-description/"
            "eosdis-components/gibs"
        ),
        image_format="image/jpeg",
        commercial_use=True,
        requires_logo=False,
        logo_url=None,
        notes=None,
    ),
    ("satellite", "eox"): AttributionResponse(
        source="eox",
        type="satellite",
        name="Sentinel-2 Cloudless by EOX",
        license="CC BY-NC-SA 4.0",
        attribution_text=(
            "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH "
            "(Contains modified Copernicus Sentinel data 2024)"
        ),
        attribution_url="https://s2maps.eu",
        image_format="image/jpeg",
        commercial_use=False,
        requires_logo=False,
        logo_url=None,
        notes="Non-commercial use only.",
    ),
    ("satellite", "nlsc"): AttributionResponse(
        source="nlsc",
        type="satellite",
        name="內政部國土測繪中心",
        license="Taiwan Gov",
        attribution_text="© 內政部國土測繪中心",
        attribution_url="https://maps.nlsc.gov.tw",
        image_format="image/png",
        commercial_use=False,
        requires_logo=False,
        logo_url=None,
        notes="Non-commercial redistribution restricted.",
    ),
    ("satellite", "sinica"): AttributionResponse(
        source="sinica",
        type="satellite",
        name="中央研究院",
        license="Academic (unconfirmed)",
        attribution_text="© 中央研究院",
        attribution_url="https://gis.sinica.edu.tw/worldmap/",
        image_format="image/png",
        commercial_use=False,
        requires_logo=False,
        logo_url=None,
        notes="ToS unconfirmed — confirm before production use.",
    ),
    ("road", "osm"): AttributionResponse(
        source="osm",
        type="road",
        name="OpenStreetMap",
        license="ODbL",
        attribution_text="© OpenStreetMap contributors",
        attribution_url="https://www.openstreetmap.org/copyright",
        image_format="image/png",
        commercial_use=True,
        requires_logo=False,
        logo_url=None,
        notes=None,
    ),
    ("road", "carto"): AttributionResponse(
        source="carto",
        type="road",
        name="CARTO",
        license="OSM ODbL + CARTO ToS",
        attribution_text="© OpenStreetMap contributors, © CARTO",
        attribution_url="https://carto.com/attributions",
        image_format="image/png",
        commercial_use=True,
        requires_logo=False,
        logo_url=None,
        notes=None,
    ),
}


def build_cache_key(
    source: str,
    type_: str,
    z: int,
    x: int,
    y: int,
    query_params: dict[str, str],
) -> str:
    if query_params:
        sorted_params = ",".join(
            f"{k}={v}" for k, v in sorted(query_params.items())
        )
    else:
        sorted_params = "_"
    return f"tile:{source}:{type_}:{sorted_params}:{z}:{x}:{y}"


def get_source_config(type_: str, source: str) -> Optional[SourceConfig]:
    return SOURCE_REGISTRY.get((type_, source))


def get_attribution(type_: str, source: str) -> Optional[AttributionResponse]:
    return ATTRIBUTION_REGISTRY.get((type_, source))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_map.py::test_cache_key_no_params \
       tests/test_map.py::test_cache_key_with_one_param \
       tests/test_map.py::test_cache_key_params_sorted \
       tests/test_map.py::test_get_source_config_valid \
       tests/test_map.py::test_get_source_config_invalid_combo \
       tests/test_map.py::test_get_attribution_valid \
       tests/test_map.py::test_get_attribution_invalid \
       tests/test_map.py::test_blank_tile_is_bytes -v
```

Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add app/services/tile_proxy.py tests/test_map.py
git commit -m "feat(map): add tile_proxy source/attribution registry, cache key builder, blank tile"
```

---

## Task 5: Create tile_proxy — fetch and cache logic (TDD)

**Files:**
- Modify: `app/services/tile_proxy.py`
- Modify: `tests/test_map.py`

- [ ] **Step 1: Write failing tests for fetch_tile**

Append to `tests/test_map.py`:

```python
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import fakeredis.aioredis

from app.services.tile_proxy import fetch_tile, BLANK_TILE


@pytest_asyncio.fixture
async def fake_redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=False)


@pytest.mark.asyncio
async def test_fetch_tile_cache_hit(fake_redis):
    """Returns cached bytes and content-type on cache hit."""
    key = "tile:nasa_gibs:satellite:_:10:1:2"
    await fake_redis.hset(key, mapping={"data": b"PNG_DATA", "ct": b"image/jpeg"})
    await fake_redis.expire(key, 604800)

    data, ct = await fetch_tile(
        redis=fake_redis,
        source="nasa_gibs",
        type_="satellite",
        z=10, x=1, y=2,
        query_params={},
    )
    assert data == b"PNG_DATA"
    assert ct == "image/jpeg"


@pytest.mark.asyncio
async def test_fetch_tile_cache_miss_upstream_success(fake_redis):
    """Fetches upstream on cache miss, stores in Redis, returns tile."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"REAL_TILE"
    mock_response.headers = {"content-type": "image/jpeg"}

    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        data, ct = await fetch_tile(
            redis=fake_redis,
            source="nasa_gibs",
            type_="satellite",
            z=10, x=1, y=2,
            query_params={},
        )

    assert data == b"REAL_TILE"
    assert ct == "image/jpeg"

    # Verify stored in cache
    key = "tile:nasa_gibs:satellite:_:10:1:2"
    cached = await fake_redis.hgetall(key)
    assert cached[b"data"] == b"REAL_TILE"
    ttl = await fake_redis.ttl(key)
    assert ttl > 0


@pytest.mark.asyncio
async def test_fetch_tile_upstream_error_returns_blank(fake_redis):
    """Returns blank tile when upstream returns non-200."""
    mock_response = MagicMock()
    mock_response.status_code = 503
    mock_response.content = b""
    mock_response.headers = {"content-type": "text/html"}

    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        data, ct = await fetch_tile(
            redis=fake_redis,
            source="nasa_gibs",
            type_="satellite",
            z=10, x=1, y=2,
            query_params={},
        )

    assert data == BLANK_TILE
    assert ct == "image/png"


@pytest.mark.asyncio
async def test_fetch_tile_redis_down_fetches_upstream():
    """When Redis is unavailable, bypasses cache and fetches upstream."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"TILE_BYTES"
    mock_response.headers = {"content-type": "image/png"}

    broken_redis = AsyncMock()
    broken_redis.hgetall = AsyncMock(side_effect=Exception("Redis connection refused"))

    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        data, ct = await fetch_tile(
            redis=broken_redis,
            source="osm",
            type_="road",
            z=5, x=0, y=0,
            query_params={},
        )

    assert data == b"TILE_BYTES"
    assert ct == "image/png"


@pytest.mark.asyncio
async def test_fetch_tile_sinica_layer_in_url(fake_redis):
    """Sinica layer param is substituted into the upstream URL."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"SINICA_TILE"
    mock_response.headers = {"content-type": "image/png"}

    captured_url = []

    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        async def capture_get(url, **kwargs):
            captured_url.append(url)
            return mock_response

        mock_client.get = capture_get
        mock_client_cls.return_value = mock_client

        await fetch_tile(
            redis=fake_redis,
            source="sinica",
            type_="satellite",
            z=8, x=10, y=20,
            query_params={"layer": "EARTH"},
        )

    assert "EARTH" in captured_url[0]
    assert "layer=EARTH" not in captured_url[0]  # param consumed, not forwarded as query string
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_map.py::test_fetch_tile_cache_hit -v
```

Expected: FAIL — `ImportError: cannot import name 'fetch_tile'`

- [ ] **Step 3: Implement fetch_tile in app/services/tile_proxy.py**

Add the following to the bottom of `app/services/tile_proxy.py`:

```python
import httpx


async def fetch_tile(
    redis,
    source: str,
    type_: str,
    z: int,
    x: int,
    y: int,
    query_params: dict[str, str],
) -> tuple[bytes, str]:
    """
    Returns (tile_bytes, content_type).
    Checks Redis cache first. On miss, fetches upstream and caches result.
    On any upstream error, returns BLANK_TILE.
    If Redis is unavailable, bypasses cache and fetches upstream directly.
    """
    config = get_source_config(type_, source)
    cache_key = build_cache_key(source, type_, z, x, y, query_params)

    # --- Cache check ---
    try:
        cached = await redis.hgetall(cache_key)
        if cached and b"data" in cached:
            return cached[b"data"], cached[b"ct"].decode()
    except Exception:
        cached = None  # Redis down — proceed to upstream

    # --- Upstream fetch ---
    layer = query_params.get("layer", "")
    url = config.url_template.format(z=z, x=x, y=y, layer=layer)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=config.headers)

        if response.status_code != 200:
            return BLANK_TILE, "image/png"

        tile_bytes = response.content
        content_type = response.headers.get("content-type", config.image_format)

    except Exception:
        return BLANK_TILE, "image/png"

    # --- Store in cache (best-effort, skip if Redis down) ---
    try:
        await redis.hset(cache_key, mapping={"data": tile_bytes, "ct": content_type})
        await redis.expire(cache_key, 604800)
    except Exception:
        pass

    return tile_bytes, content_type
```

- [ ] **Step 4: Run all fetch_tile tests**

```bash
pytest tests/test_map.py::test_fetch_tile_cache_hit \
       tests/test_map.py::test_fetch_tile_cache_miss_upstream_success \
       tests/test_map.py::test_fetch_tile_upstream_error_returns_blank \
       tests/test_map.py::test_fetch_tile_redis_down_fetches_upstream \
       tests/test_map.py::test_fetch_tile_sinica_layer_in_url -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add app/services/tile_proxy.py tests/test_map.py
git commit -m "feat(map): implement tile fetch and Redis cache logic"
```

---

## Task 6: Create map endpoints and register router (TDD)

**Files:**
- Create: `app/api/v1/endpoints/map.py`
- Modify: `app/api/v1/api.py`
- Modify: `tests/test_map.py`

- [ ] **Step 1: Write failing integration tests**

Append to `tests/test_map.py`:

```python
import pytest_asyncio
import fakeredis.aioredis
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.tile_proxy import BLANK_TILE


@pytest_asyncio.fixture
async def map_client():
    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=False)
    app.state.redis = fake_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac, fake_redis


@pytest.mark.asyncio
async def test_tile_endpoint_invalid_source(map_client):
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/tile/satellite/mapbox/10/1/2")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_tile_endpoint_invalid_type_source_combo(map_client):
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/tile/road/nasa_gibs/10/1/2")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_tile_endpoint_invalid_zoom(map_client):
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/tile/satellite/nasa_gibs/25/1/2")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_tile_endpoint_sinica_missing_layer(map_client):
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/tile/satellite/sinica/10/1/2")
    assert resp.status_code == 400
    assert "layer" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tile_endpoint_cache_hit_returns_tile(map_client):
    ac, fake_redis = map_client
    key = "tile:nasa_gibs:satellite:_:10:1:2"
    await fake_redis.hset(key, mapping={"data": b"CACHED_PNG", "ct": b"image/jpeg"})
    await fake_redis.expire(key, 604800)

    resp = await ac.get("/api/v1/map/tile/satellite/nasa_gibs/10/1/2")
    assert resp.status_code == 200
    assert resp.content == b"CACHED_PNG"
    assert resp.headers["content-type"] == "image/jpeg"


@pytest.mark.asyncio
async def test_tile_endpoint_upstream_error_returns_blank(map_client):
    ac, _ = map_client
    with patch("app.services.tile_proxy.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=Exception("upstream down"))
        mock_client_cls.return_value = mock_client

        resp = await ac.get("/api/v1/map/tile/satellite/nasa_gibs/10/1/2")

    assert resp.status_code == 200
    assert resp.content == BLANK_TILE
    assert resp.headers["content-type"] == "image/png"


@pytest.mark.asyncio
async def test_attribution_endpoint_valid(map_client):
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/attribution/satellite/nasa_gibs")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "nasa_gibs"
    assert body["requires_logo"] is False
    assert body["logo_url"] is None
    assert "NASA" in body["attribution_text"]


@pytest.mark.asyncio
async def test_attribution_endpoint_invalid(map_client):
    ac, _ = map_client
    resp = await ac.get("/api/v1/map/attribution/road/nasa_gibs")
    assert resp.status_code == 400
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_map.py::test_tile_endpoint_invalid_source -v
```

Expected: FAIL — 404 (route not registered yet)

- [ ] **Step 3: Create app/api/v1/endpoints/map.py**

```python
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response
from app.schemas.map import AttributionResponse
from app.services.tile_proxy import (
    fetch_tile,
    get_source_config,
    get_attribution,
)

router = APIRouter()

VALID_SOURCES = {
    "satellite": {"nasa_gibs", "eox", "nlsc", "sinica"},
    "road": {"osm", "carto"},
}


def _validate(type_: str, source: str, z: int) -> None:
    allowed = VALID_SOURCES.get(type_)
    if allowed is None or source not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type/source combination: {type_}/{source}",
        )
    if not (0 <= z <= 19):
        raise HTTPException(
            status_code=400,
            detail=f"Zoom level z={z} is out of range (0-19)",
        )


@router.get("/tile/{type_}/{source}/{z}/{x}/{y}")
async def get_tile(
    type_: str,
    source: str,
    z: int,
    x: int,
    y: int,
    request: Request,
    layer: Optional[str] = None,
):
    """
    Proxy a map tile from an upstream source with 7-day Redis caching.

    **type** — `satellite` or `road`

    **source** — one of:
    - satellite: `nasa_gibs` (image/jpeg), `eox` (image/jpeg), `nlsc` (image/png), `sinica` (image/png)
    - road: `osm` (image/png), `carto` (image/png)

    **z/x/y** — Standard XYZ slippy map tile coordinates (z: 0–19)

    **layer** — Required only for `source=sinica`. Pass the Sinica layer name
    (e.g. `EARTH`, `TAIWAN_MOSAIC`). See https://gis.sinica.edu.tw/worldmap/
    for available layers. Ignored for all other sources.

    Returns the raw tile image bytes with the upstream Content-Type header.
    On upstream error, returns a 1×1 transparent PNG.
    """
    _validate(type_, source, z)

    if source == "sinica" and not layer:
        raise HTTPException(
            status_code=400,
            detail="layer is required for source=sinica",
        )

    query_params = {}
    if layer:
        query_params["layer"] = layer

    redis_client = request.app.state.redis
    tile_bytes, content_type = await fetch_tile(
        redis=redis_client,
        source=source,
        type_=type_,
        z=z,
        x=x,
        y=y,
        query_params=query_params,
    )

    return Response(content=tile_bytes, media_type=content_type)


@router.get("/attribution/{type_}/{source}", response_model=AttributionResponse)
async def get_attribution_info(type_: str, source: str):
    """
    Return attribution metadata for a given tile source.

    The frontend should display `attribution_text` on the map.
    When `requires_logo` is true, also render the logo from `logo_url`.
    """
    _validate(type_, source, z=0)  # z=0 is always valid, just checking type/source
    attr = get_attribution(type_, source)
    if attr is None:
        raise HTTPException(status_code=400, detail=f"No attribution for {type_}/{source}")
    return attr
```

- [ ] **Step 4: Register map router in app/api/v1/api.py**

```python
from fastapi import APIRouter
from app.api.v1.endpoints import rbac_test, auth, users, map

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["認證系統"])
api_router.include_router(users.router, prefix="/users", tags=["使用者管理"])
api_router.include_router(rbac_test.router, prefix="/rbac-test", tags=["RBAC 測試"])
api_router.include_router(map.router, prefix="/map", tags=["地圖圖磚"])
```

- [ ] **Step 5: Run all integration tests**

```bash
pytest tests/test_map.py::test_tile_endpoint_invalid_source \
       tests/test_map.py::test_tile_endpoint_invalid_type_source_combo \
       tests/test_map.py::test_tile_endpoint_invalid_zoom \
       tests/test_map.py::test_tile_endpoint_sinica_missing_layer \
       tests/test_map.py::test_tile_endpoint_cache_hit_returns_tile \
       tests/test_map.py::test_tile_endpoint_upstream_error_returns_blank \
       tests/test_map.py::test_attribution_endpoint_valid \
       tests/test_map.py::test_attribution_endpoint_invalid -v
```

Expected: 8 passed

- [ ] **Step 6: Run the full test suite to catch regressions**

```bash
pytest --ignore=tests/test_graphql -v
```

Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/endpoints/map.py app/api/v1/api.py tests/test_map.py
git commit -m "feat(map): add tile and attribution endpoints, register map router"
```

---

## Done

All spec requirements are covered:

| Requirement | Task |
|---|---|
| Redis in Docker Compose with `allkeys-lru` | Task 1 |
| `REDIS_URL` config, Redis startup/shutdown | Task 2 |
| `AttributionResponse` schema with all fields | Task 3 |
| Source registry with URL templates + headers | Task 4 |
| Attribution registry for all 6 sources | Task 4 |
| Unified cache key with sorted params | Task 4 |
| 7-day TTL Redis hash cache | Task 5 |
| Blank tile on upstream error | Task 5 |
| Redis-down graceful degradation | Task 5 |
| Sinica `layer` substituted into upstream URL | Task 5 |
| `/tile` endpoint with validation | Task 6 |
| `/attribution` endpoint | Task 6 |
| `source=sinica` requires `?layer=` | Task 6 |
