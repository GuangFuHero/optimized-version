"""SQLAlchemy models for station and task property configuration schemas."""

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class StationPropertyConfig(Base, UUIDPKMixin):
    """ORM model defining the property schema for a given station type."""

    __tablename__ = "station_property_config"
    station_type: Mapped[str] = mapped_column(String(50))
    property_name: Mapped[str] = mapped_column(String(100))
    data_type: Mapped[str] = mapped_column(String(50))
    enum_options: Mapped[list | None] = mapped_column(JSON, nullable=True)


class TaskPropertyConfig(Base, UUIDPKMixin):
    """ORM model defining the property schema for a given task type."""

    __tablename__ = "task_property_config"
    task_type: Mapped[str] = mapped_column(String(50))
    property_name: Mapped[str] = mapped_column(String(100))
    data_type: Mapped[str] = mapped_column(String(50))
    enum_options: Mapped[list | None] = mapped_column(JSON, nullable=True)
