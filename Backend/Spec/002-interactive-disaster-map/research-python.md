# Research & Technical Decisions: Interactive Disaster Relief Map (Python Stack)

**Feature**: 002-interactive-disaster-map
**Date**: 2025-11-29
**Update**: Revised for Python backend (team expertise, refactor from legacy FastAPI system)

---

## Python GraphQL Ecosystem Selection

### Question
Which Python GraphQL library best supports flexible schema, type safety, and FastAPI integration?

### Research Findings

**Libraries Evaluated**:

1. **Strawberry GraphQL** (Selected ✅)
   - Modern, type-hint based (Python 3.7+ dataclasses)
   - Native FastAPI/ASGI integration
   - Active development, good documentation
   - Supports subscriptions (WebSocket for future real-time features)

2. **Graphene-Python**
   - Mature, widely used
   - Class-based schema (less Pythonic than dataclasses)
   - Slower updates, dated patterns

3. **Ariadne**
   - Schema-first approach (SDL)
   - Less type-safe, more manual resolver mapping
   - Good for teams preferring SDL-first design

### Decision: Strawberry GraphQL + FastAPI

**Rationale**:
- Type hints provide compile-time safety (catches errors early)
- Dataclass-based types integrate seamlessly with Pydantic (FastAPI models)
- AsyncIO support (required for high concurrency)
- Team already familiar with FastAPI from legacy system

**Example Implementation**:

```python
# app/graphql/types/marker.py
import strawberry
from typing import Optional
from datetime import datetime

@strawberry.type
class Marker:
    id: str
    name: str
    marker_type: str
    coordinates: "Coordinates"  # Custom scalar
    status: str
    additional_info: Optional[dict] = None  # JSON field for dynamic data
    created_by: "User"
    updated_at: datetime

@strawberry.type
class Coordinates:
    latitude: float
    longitude: float
    type: str = "Point"  # GeoJSON type

# app/graphql/queries/markers.py
import strawberry
from typing import List

@strawberry.type
class Query:
    @strawberry.field
    async def markers(
        self,
        info,
        marker_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[Marker]:
        # Use SQLAlchemy async session from context
        session = info.context["db_session"]
        query = select(MarkerModel)
        if marker_type:
            query = query.where(MarkerModel.type == marker_type)
        result = await session.execute(query.limit(limit))
        return [to_graphql_marker(m) for m in result.scalars()]

# app/main.py (FastAPI integration)
from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter

app = FastAPI()
graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")
```

**Trade-offs**:
- ✅ Type safety via Python type hints
- ✅ Familiar async/await patterns (team knows FastAPI)
- ❌ Smaller community vs Graphene (but growing rapidly)

---

## SQLAlchemy 2.x vs Legacy  1.x

### Decision: SQLAlchemy 2.0+ with Async Support

**Rationale**:
- Legacy system uses SQLAlchemy 1.4 (synchronous)
- 2.x provides asyncio support (required for Strawberry async resolvers)
- Preserves existing table structure (minimal migration pain)
- Better type annotations, improved query API

**Migration from Legacy**:

```python
# Legacy (SQLAlchemy 1.4 sync)
from sqlalchemy import Column, String, JSON, DateTime
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Place(Base):
    __tablename__ = "places"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    coordinates = Column(JSON, nullable=False)
    additional_info = Column(JSON)

# Modern (SQLAlchemy 2.x async)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from typing import Optional
import uuid

class Base(DeclarativeBase):
    pass

class Marker(Base):
    __tablename__ = "places"  # Keep legacy table name

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str]
    coordinates: Mapped[dict]  # JSONB in Postgres
    additional_info: Mapped[Optional[dict]]

    # New fields for Feature 002
    h3_index_13: Mapped[Optional[str]] = mapped_column(index=True)
    whitelist_approved: Mapped[bool] = mapped_column(default=False)

# Async session factory
async_engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    echo=True
)

async def get_session() -> AsyncSession:
    async with AsyncSession(async_engine) as session:
        yield session
```

**Alembic Migration Strategy**:
- Autogenerate migrations from SQLAlchemy models
- Preserve legacy `places` table structure
- Add new columns/tables incrementally
- Zero-downtime deployment (additive changes only)

---

## DataLoader Pattern in Python

### Question
How to implement GraphQL DataLoader (N+1 problem) in Python/Strawberry?

### Decision: Use `strawberry-dataloader` Extension

**Implementation**:

```python
# app/graphql/loaders.py
from strawberry.dataloader import DataLoader
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

async def load_users_batch(keys: List[str], session: AsyncSession) -> List[User]:
    """Batch load users by IDs"""
    result = await session.execute(
        select(UserModel).where(UserModel.id.in_(keys))
    )
    users = {u.id: u for u in result.scalars()}
    # Return in same order as keys (DataLoader requirement)
    return [users.get(k) for k in keys]

def create_loaders(session: AsyncSession):
    """Create DataLoader instances per-request"""
    return {
        "user_loader": DataLoader(
            load_fn=lambda keys: load_users_batch(keys, session)
        ),
        "photos_loader": DataLoader(
            load_fn=lambda keys: load_photos_batch(keys, session)
        )
    }

# app/graphql/types/marker.py
@strawberry.type
class Marker:
    id: str
    name: str
    created_by_id: strawberry.Private[str]  # Hide from GraphQL schema

    @strawberry.field
    async def created_by(self, info) -> User:
        """Resolve user via DataLoader (batched)"""
        loader = info.context["loaders"]["user_loader"]
        return await loader.load(self.created_by_id)

# app/main.py - Context injection
async def get_context(request: Request):
    session = request.state.db_session
    return {
        "db_session": session,
        "loaders": create_loaders(session),
        "user": request.state.user  # From auth middleware
    }

graphql_app = GraphQLRouter(schema, context_getter=get_context)
```

**Performance**: Same 20-26x improvement as Node.js DataLoader

---

## H3 Integration (Python)

### Library: h3-py (Official Uber H3 Python Bindings)

```python
# app/services/geospatial.py
import h3
from shapely.geometry import Point
from sqlalchemy import func
from app.models.marker import Marker

async def find_nearby_markers(
    lat: float,
    lon: float,
    radius_meters: float = 50,
    session: AsyncSession
) -> List[Marker]:
    """Find markers within radius using H3 + PostGIS"""

    # Step 1: Get H3 cell for query point (resolution 13)
    h3_index = h3.latlng_to_cell(lat, lon, 13)

    # Step 2: Get k-ring (1-ring = adjacent hexagons)
    k_ring = h3.grid_disk(h3_index, 1)

    # Step 3: Query candidates from H3 index (FAST)
    candidates_query = select(Marker).where(
        Marker.h3_index_13.in_(k_ring)
    )
    result = await session.execute(candidates_query)
    candidates = result.scalars().all()

    # Step 4: Filter by exact distance using PostGIS (PRECISE)
    point = f"POINT({lon} {lat})"
    filtered = []
    for marker in candidates:
        distance_query = select(
            func.ST_Distance(
                func.ST_GeogFromText(point),
                func.ST_GeogFromText(marker.coordinates_wkt)
            )
        )
        distance = await session.scalar(distance_query)
        if distance <= radius_meters:
            filtered.append(marker)

    return filtered
```

**Installation**:
```bash
pip install h3  # C extension, requires build tools
# Alternative: conda install -c conda-forge h3-py
```

---

## LINE Login Integration (Python)

### SDK: `line-bot-sdk`

```python
# app/services/auth.py
from linebot import LineBotApi, WebhookHandler
from linebot.models import MessageEvent, TextMessage
import jwt
from datetime import datetime, timedelta

class AuthService:
    def __init__(self):
        self.line_api = LineBotApi(settings.LINE_CHANNEL_ACCESS_TOKEN)
        self.jwt_secret = settings.JWT_SECRET

    async def verify_line_token(self, access_token: str) -> dict:
        """Verify LINE access token and get user profile"""
        try:
            profile = self.line_api.get_profile(access_token)
            return {
                "line_user_id": profile.user_id,
                "display_name": profile.display_name,
                "picture_url": profile.picture_url
            }
        except Exception as e:
            raise ValueError(f"Invalid LINE token: {e}")

    async def create_session(
        self,
        line_user: dict,
        session: AsyncSession
    ) -> str:
        """Create JWT session token for authenticated user"""

        # Check whitelist status
        result = await session.execute(
            select(User).where(User.line_user_id == line_user["line_user_id"])
        )
        user = result.scalar_one_or_none()

        if not user or user.whitelist_status != "approved":
            raise PermissionError("User not whitelisted")

        # Generate JWT (24h expiry)
        payload = {
            "user_id": str(user.id),
            "role": user.role,
            "line_user_id": user.line_user_id,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(hours=24)
        }
        token = jwt.encode(payload, self.jwt_secret, algorithm="HS256")
        return token

# app/middleware/auth.py
from fastapi import Request, HTTPException
import jwt

async def auth_middleware(request: Request, call_next):
    """Extract and validate JWT from Authorization header"""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")

    if token:
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET,
                algorithms=["HS256"]
            )
            request.state.user = payload

            # Auto-extend session if active
            token_age = datetime.utcnow().timestamp() - payload["iat"]
            if token_age < 24 * 3600:  # Within 24h
                new_token = create_session_token(payload)
                # Set response header (FastAPI response middleware)
                request.state.new_token = new_token
        except jwt.ExpiredSignatureError:
            request.state.user = None
        except jwt.InvalidTokenError:
            request.state.user = None

    response = await call_next(request)

    # Add new token to response header if generated
    if hasattr(request.state, "new_token"):
        response.headers["X-New-Token"] = request.state.new_token

    return response
```

**Environment Variables**:
```python
# app/config/settings.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # LINE Login
    LINE_CHANNEL_ID: str
    LINE_CHANNEL_SECRET: str
    LINE_CHANNEL_ACCESS_TOKEN: str
    LINE_LOGIN_CALLBACK_URL: str = "http://localhost:3000/auth/line/callback"

    # JWT
    JWT_SECRET: str  # Min 32 chars
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost/disaster_map"

    # Photo Storage (External URLs only)
    ALLOWED_PHOTO_HOSTS: List[str] = ["i.imgur.com", "res.cloudinary.com"]
    MAX_PHOTOS_PER_MARKER: int = 10

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## Photo URL Storage and Validation (Python)

### Implementation with URL Validation

```python
# app/services/photo_validator.py
from urllib.parse import urlparse
from typing import List
import re

ALLOWED_HOSTS = [
    'i.imgur.com',
    'res.cloudinary.com',
    'images.unsplash.com',
    'raw.githubusercontent.com'
]

class PhotoValidator:
    def __init__(self):
        self.allowed_hosts = ALLOWED_HOSTS
        self.max_urls_per_marker = 10

    def validate_url(self, url: str) -> bool:
        """Validate photo URL from external hosting"""
        try:
            parsed = urlparse(url)

            # Check protocol
            if parsed.scheme not in ['http', 'https']:
                return False

            # Check allowed hosts
            if not any(host in parsed.netloc for host in self.allowed_hosts):
                return False

            # Check file extension
            valid_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
            if not any(parsed.path.lower().endswith(ext) for ext in valid_extensions):
                return False

            return True
        except Exception:
            return False

    def validate_urls(self, urls: List[str]) -> dict:
        """Validate multiple photo URLs"""
        if len(urls) > self.max_urls_per_marker:
            return {
                "valid": False,
                "error": f"Maximum {self.max_urls_per_marker} photos per marker"
            }

        invalid_urls = [url for url in urls if not self.validate_url(url)]

        if invalid_urls:
            return {
                "valid": False,
                "error": f"Invalid URLs: {', '.join(invalid_urls)}",
                "invalid_urls": invalid_urls
            }

        return {
            "valid": True,
            "validated_urls": urls
        }

# app/graphql/mutations/markers.py
from app.services.photo_validator import PhotoValidator

validator = PhotoValidator()

@strawberry.mutation
async def create_marker(
    info,
    name: str,
    coordinates: CoordinatesInput,
    photo_urls: Optional[List[str]] = None
) -> Marker:
    """Create marker with photo URL validation"""

    # Validate photo URLs if provided
    if photo_urls:
        validation = validator.validate_urls(photo_urls)
        if not validation["valid"]:
            raise ValueError(validation["error"])

    # Store validated URLs in database
    marker = await create_marker_in_db(
        name=name,
        coordinates=coordinates,
        photo_urls=photo_urls or []
    )

    return marker
```

**Dependencies**:
```txt
# requirements.txt
fastapi==0.104.1
strawberry-graphql[fastapi]==0.216.0
sqlalchemy==2.0.23
asyncpg==0.29.0  # Async Postgres driver
alembic==1.12.1
pydantic-settings==2.1.0
python-jose[cryptography]==3.3.0  # JWT
line-bot-sdk==3.6.0
h3==3.7.6
shapely==2.0.2
```

---

## Summary of Python-Specific Decisions

| Area | Decision | Key Benefit |
|------|----------|-------------|
| **GraphQL Library** | Strawberry GraphQL | Type-safe, FastAPI native, modern dataclass patterns |
| **ORM** | SQLAlchemy 2.x (async) | Team familiarity, async support, preserves legacy schema |
| **Testing** | pytest + httpx | Async test support, GraphQL client testing |
| **Migrations** | Alembic | Team already uses (legacy system), zero-downtime |
| **H3 Geospatial** | h3-py (official bindings) | Same performance as Node.js h3, native C extension |
| **LINE Auth** | line-bot-sdk + PyJWT | Official SDK, standard JWT patterns |
| **Photo Storage** | URL validation (urllib) | External hosting (imgur/cloudinary), no storage infrastructure |

---

## Migration from Legacy FastAPI System

**Advantages of Python Stack**:
1. **Zero Learning Curve**: Team already knows Python, FastAPI, SQLAlchemy
2. **Code Reuse**: Can reuse services from legacy (auth, geospatial helpers)
3. **Database Continuity**: Same Alembic migrations, PostgreSQL connections
4. **Faster Development**: No context switching between languages

**Estimated Migration Time**:
- Phase 1 (MVP): 2-3 weeks (vs 4-6 weeks with Node.js learning curve)
- Team productivity: 80% (familiar stack) vs 50% (new ecosystem)

---

## Next Steps

1. ✅ Python research complete
2. ⏭️ Generate data-model.md (SQLAlchemy models + Strawberry types)
3. ⏭️ Generate contracts/schema.graphql
4. ⏭️ Generate quickstart.md (Python setup)

**Status**: Python-focused research complete, ready for Phase 1 design.
