"""SQLAlchemy model for routes between stations."""

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class Route(Base, UUIDPKMixin):
    """ORM model for a route linking an origin geometry to a destination geometry."""

    __tablename__ = "routes"
    origin_uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"))
    destination_uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"))
