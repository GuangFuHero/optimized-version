from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.api import api_router

app = FastAPI(
    title="救災平台 API",
    description="災難救援與資源調度平台後端服務",
    version="0.1.0",
)

# 設定 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開發環境，之後需縮小範圍
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 註冊路由
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "Welcome to Disaster Relief Platform API", "status": "online"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
