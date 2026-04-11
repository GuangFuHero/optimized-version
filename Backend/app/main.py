from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pyrate_limiter import Duration, Limiter, Rate
from app.api.v1.api import api_router

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
    初始化頻率限制引擎 (v3 模式)
    """
    import os
    # 即時讀取環境變數，解決測試時 settings 實例已產生的問題
    env = os.getenv("ENV", "development")
    
    # 如果是測試環境，給予極高的配額以免干擾測試流程
    rate_val = 100 if env != "testing" else 999999
    app.state.limiter = Limiter(Rate(rate_val, Duration.MINUTE))


# 註冊路由
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "Welcome to Disaster Relief Platform API", "status": "online"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}

