"""SQLAlchemy model registry — imports all models so Alembic and the mapper can discover them."""

from app.models.auth import (  # noqa: F401
    Group,
    Policy,
    PolicyGroupAssign,
    PolicyUserAssign,
    User,
    UserGroupAssign,
)
from app.models.geo import BaseGeometry, ClosureArea, Station  # noqa: F401
from app.models.photo import Photo  # noqa: F401
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig  # noqa: F401
from app.models.request import Tickets  # noqa: F401
from app.models.route import Route  # noqa: F401
from app.models.secondary_location import SecondaryLocation  # noqa: F401
from app.models.station_property import CrowdSourcing, StationProperty  # noqa: F401
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask  # noqa: F401
