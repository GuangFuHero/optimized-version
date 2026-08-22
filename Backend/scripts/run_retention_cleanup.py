"""Standalone CLI runner for notification data retention cleanup (PRD Section 9 / Q4 resolution).

Usage:
    python3 scripts/run_retention_cleanup.py

Can be scheduled via Cron, systemd timer, or Kubernetes CronJob.
"""

import asyncio
import logging
import sys
from pathlib import Path

# 將 Backend 根目錄加入 sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.retention import cleanup_expired_notifications  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("retention_worker")


async def main() -> None:
    """Execute the notification retention cleanup task."""
    logger.info("🚀 啟動通知資料保留清理任務 (Notification Retention Worker)...")
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        cleaned_count = await cleanup_expired_notifications(db)
        logger.info(f"✅ 清理完成！共軟刪除 {cleaned_count} 筆過期通知。")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
