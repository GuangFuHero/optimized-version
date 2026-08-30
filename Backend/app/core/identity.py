"""The identity a request is acting as (feature 010, ADR-068/069).

An identity is one row of `user_role_assign`: a role, plus the team it applies to when the
role is team-kind. Exactly one is active per request. Platform roles are identities too, so
switching away from `super_admin` genuinely drops its grants rather than keeping them
alongside — that is the whole point of the switching model.

The `act` claim carries `(role_uuid, team_uuid)` rather than the grant row's primary key.
The two are equivalent now that the unique key includes the team, but this form survives a
grant being deleted and re-added, and survives `rename_role`.
"""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class ActiveIdentity:
    """A resolved identity, with names snapshotted for auditing (ADR-076)."""

    role_uuid: str
    team_uuid: str | None
    role_name: str
    team_name: str | None

    @property
    def is_platform(self) -> bool:
        """True when this identity belongs to no team."""
        return self.team_uuid is None

    def to_claim(self) -> str:
        """Serialize for the access token's `act` claim."""
        return encode_act(self.role_uuid, self.team_uuid)

    def to_view(self) -> dict:
        """The shape returned to clients on a token response (ADR-205).

        Deliberately not `to_audit_context()`: that one is nested under an `identity` key and
        keyed for the audit trail's own reader. Same four values, different envelope, and
        letting one drift into the other would tie the API's shape to the audit format.
        """
        return {
            "role_uuid": self.role_uuid, "role": self.role_name,
            "team_uuid": self.team_uuid, "team": self.team_name,
        }

    def to_audit_context(self) -> dict:
        """The snapshot written to `audit_logs.context` (ADR-076).

        Names are stored alongside the uuids, not looked up later: `Role` is hard-deleted by
        `DELETE /rbac/roles/{uuid}` and can be renamed, so a uuid is not guaranteed to still
        resolve when someone reads the trail.
        """
        return {
            "identity": {
                "role_uuid": self.role_uuid, "role": self.role_name,
                "team_uuid": self.team_uuid, "team": self.team_name,
            }
        }


def encode_act(role_uuid: str, team_uuid: str | None) -> str:
    """Build the `act` claim value."""
    return f"{role_uuid}:{team_uuid or ''}"


def _parse_uuid(value: str) -> str | None:
    """Canonical uuid string, or None when `value` is not a uuid at all."""
    try:
        return str(UUID(value))
    except (ValueError, AttributeError, TypeError):
        return None


def decode_act(act: str | None) -> tuple[str, str | None] | None:
    """Parse an `act` claim into (role_uuid, team_uuid), or None if it is unusable.

    Malformed input returns None rather than raising: a token is attacker-influenced data,
    and the caller treats "cannot parse" the same as "identity no longer exists" (401).

    Both halves are validated as uuids here, not just split apart. The caller binds them
    straight into `uuid` columns, and `POST /auth/login` (`scope`) and `POST /auth/refresh`
    (`identity`) both accept a free-form string from an unauthenticated client — an
    unvalidated "garbage:" would reach the driver and surface as a 500 instead of the
    fallback-to-default / 401 this function exists to produce.
    """
    if not act or not isinstance(act, str):
        return None
    role_part, separator, team_part = act.partition(":")
    if not separator:
        return None
    role_uuid = _parse_uuid(role_part)
    if role_uuid is None:
        return None
    if not team_part:
        return role_uuid, None
    team_uuid = _parse_uuid(team_part)
    if team_uuid is None:
        return None
    return role_uuid, team_uuid
