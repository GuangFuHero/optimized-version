from typing import Generic, Type, TypeVar, List, Optional, Any, Dict
from sqlalchemy import select, update, delete, func, asc, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import Base

ModelType = TypeVar("ModelType", bound=Base)


class GenericRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    async def get_by_uuid(self, db: AsyncSession, uuid: Any) -> Optional[ModelType]:
        query = select(self.model).where(self.model.uuid == uuid)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def get_multi(
            self,
            db: AsyncSession,
            *,
            skip: int = 0,
            limit: int = 100,
            filters: Dict[str, Any] = None,
            sort_by: Optional[str] = None,
            sort_desc: bool = False
    ) -> List[ModelType]:
        """
        DataTable 核心邏輯：支援動態過濾、分頁與排序
        """
        query = select(self.model)

        # 1. 處理過濾 (簡單的等值過濾，可擴充為更複雜的運算)
        if filters:
            for field, value in filters.items():
                if hasattr(self.model, field) and value is not None:
                    query = query.where(getattr(self.model, field) == value)

        # 2. 處理排序
        if sort_by and hasattr(self.model, sort_by):
            order_fn = desc if sort_desc else asc
            query = query.order_by(order_fn(getattr(self.model, sort_by)))
        else:
            # 預設排序 (若有 created_at)
            if hasattr(self.model, "created_at"):
                query = query.order_by(desc(self.model.created_at))

        # 3. 分頁
        query = query.offset(skip).limit(limit)

        result = await db.execute(query)
        return result.scalars().all()

    async def count(self, db: AsyncSession, filters: Dict[str, Any] = None) -> int:
        query = select(func.count()).select_from(self.model)
        if filters:
            for field, value in filters.items():
                if hasattr(self.model, field) and value is not None:
                    query = query.where(getattr(self.model, field) == value)
        result = await db.execute(query)
        return result.scalar() or 0

    async def create(self, db: AsyncSession, *, obj_in: Dict[str, Any]) -> ModelType:
        db_obj = self.model(**obj_in)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update(
            self, db: AsyncSession, *, db_obj: ModelType, obj_in: Dict[str, Any]
    ) -> ModelType:
        for field in obj_in:
            if hasattr(db_obj, field):
                setattr(db_obj, field, obj_in[field])
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def remove(self, db: AsyncSession, *, uuid: Any) -> ModelType:
        query = delete(self.model).where(self.model.uuid == uuid).returning(self.model)
        result = await db.execute(query)
        await db.commit()
        return result.scalar_one()
