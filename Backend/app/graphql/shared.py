"""Shared GraphQL types reused across domains."""

import enum

import strawberry


@strawberry.enum
class Visibility(enum.Enum):
    """How widely a record is shown. Shared by stations, tickets, and ticket tasks."""

    public = "public"
    restricted = "restricted"
    internal = "internal"


@strawberry.type
class PageInfo:
    """Pagination metadata for list responses."""

    total_count: int = strawberry.field(
        description="Total number of matching records across all pages"
    )
    has_next_page: bool = strawberry.field(
        description="True if there are more records after the current page"
    )
    has_previous_page: bool = strawberry.field(
        description="True if there are records before the current page"
    )
