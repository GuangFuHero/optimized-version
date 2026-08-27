"""Repository for photos attached to geo entities (stations, tickets) or poles."""

from app.infrastructure.repository.base import GenericRepository
from app.models.photo import Photo


class PhotoRepository(GenericRepository[Photo]):
    """Repository for Photo queries (pure CRUD, ADR-015)."""

    def __init__(self):
        """Initialize with Photo as the managed model."""
        super().__init__(Photo)


photo_repository = PhotoRepository()
