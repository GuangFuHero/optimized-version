# Product areas

Product areas are stable, long-lived capabilities. Their semantic paths do not change when a Feature changes Version or release status.

## Canonical areas

| Product area | Semantic path | Current target |
|---|---|---|
| Identity and Account | [`identity-and-account/`](./identity-and-account/README.md) | `v0.2.0` |
| Access Control | [`access-control/`](./access-control/README.md) | `v0.1.0` |
| Member Management | [`member-management/`](./member-management/README.md) | `v0.1.0` |
| Map Decision Support | [`map-decision-support/`](./map-decision-support/README.md) | `v0.1.0` for Zone drawing; remaining map capabilities target `v0.2.0` |
| Resource Stations | [`resource-stations/`](./resource-stations/README.md) | `v0.1.0` |
| Task Management | [`task-management/`](./task-management/README.md) | `v0.1.0`; guest privacy targets `v0.2.0` |
| Emergency Announcements | [`emergency-announcements/`](./emergency-announcements/README.md) | `v0.2.0` |

Every link above points to a real product-area entry; do not create empty area placeholders.

## Historical name mapping

These names exist only to diagnose old references. They are not canonical paths.

| Historical name | Canonical area / Feature |
|---|---|
| `01-auth` | `identity-and-account` / `IAM-FEAT-001` |
| `02-user-profile` | `identity-and-account` / `IAM-FEAT-002` |
| `03-user-settings` | `identity-and-account` / `IAM-FEAT-003` |
| `04-rbac` | `access-control` / `AC-FEAT-001` |
| `05-member-management` | `member-management` / `MEM-FEAT-001` |
| `06-map-decision-support` | `map-decision-support` / `MAP-FEAT-001` and `MAP-FEAT-002` |
| `07-resource-station` | `resource-stations` / `RS-FEAT-001` |
| `08-ticket-management` | `task-management` / `TM-FEAT-001` through `TM-FEAT-006` |
| `09-emergency-announcement` | `emergency-announcements` / `EA-FEAT-001` |
| `10-guest-ticket-privacy` | `task-management` / `TM-FEAT-003` |
