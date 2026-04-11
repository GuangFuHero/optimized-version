"""Shared GraphQL types reused across domains."""

import strawberry


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
