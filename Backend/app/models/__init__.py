"""SQLAlchemy model registry — imports all models so Alembic and the mapper can discover them."""

from app.models.announcement import Announcement  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401
from app.models.briefing import Briefing, BriefingTemplate  # noqa: F401
from app.models.auth import (  # noqa: F401
    User,
    UserContact,
    UserIdentity,
)
from app.models.geo import BaseGeometry, ClosureArea, Station  # noqa: F401
from app.models.photo import Photo  # noqa: F401
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig  # noqa: F401
from app.models.rbac import (  # noqa: F401
    Permission,
    Role,
    RolePermissionAssign,
    UserPermissionAssign,
    UserRoleAssign,
)
from app.models.request import Tickets  # noqa: F401
from app.models.route import Route  # noqa: F401
from app.models.secondary_location import SecondaryLocation  # noqa: F401
from app.models.station_property import (  # noqa: F401
    CrowdSourcing,
    StationProperty,
    StationUpdateSuggestion,
)
from app.models.team import Team, TeamZoneAssign, WorkZone  # noqa: F401
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask  # noqa: F401

