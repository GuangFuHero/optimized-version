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

# 設定 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """
    初始化頻率限制引擎與 Redis 連線
    """
    import os
    import redis.asyncio as aioredis

    env = os.getenv("ENV", "development")
    rate_val = 100 if env != "testing" else 999999
    app.state.limiter = Limiter(Rate(rate_val, Duration.MINUTE))

    app.state.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=False)


@app.on_event("shutdown")
async def shutdown():
    """
    清理 Redis 連線
    """
    if hasattr(app.state, "redis"):
        await app.state.redis.aclose()


# 註冊路由
app.include_router(api_router, prefix="/api/v1")

# GraphQL
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
