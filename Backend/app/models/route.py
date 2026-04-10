from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import UUIDPKMixin, Base


class Route(Base, UUIDPKMixin):
    __tablename__ = "routes"
    origin_uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"))
    destination_uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"))
