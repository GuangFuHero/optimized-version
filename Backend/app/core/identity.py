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


def decode_act(act: str | None) -> tuple[str, str | None] | None:
    """Parse an `act` claim into (role_uuid, team_uuid), or None if it is unusable.

    Malformed input returns None rather than raising: a token is attacker-influenced data,
    and the caller treats "cannot parse" the same as "identity no longer exists" (401).
    """
    if not act or not isinstance(act, str):
        return None
    role_uuid, separator, team_uuid = act.partition(":")
    if not separator or not role_uuid:
        return None
    return role_uuid, (team_uuid or None)
