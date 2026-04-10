from sqlalchemy import String, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import UUIDPKMixin, Base
from typing import Optional


class StationPropertyConfig(Base, UUIDPKMixin):
    __tablename__ = "station_property_config"
    station_type: Mapped[str] = mapped_column(String(50))
    property_name: Mapped[str] = mapped_column(String(100))
    data_type: Mapped[str] = mapped_column(String(50))
    enum_options: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)


class TaskPropertyConfig(Base, UUIDPKMixin):
    __tablename__ = "task_property_config"
    task_type: Mapped[str] = mapped_column(String(50))
    property_name: Mapped[str] = mapped_column(String(100))
    data_type: Mapped[str] = mapped_column(String(50))
    enum_options: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
