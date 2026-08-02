# Product areas

Product areas are stable, long-lived capabilities. Their semantic paths do not change when a Feature changes Version or release status.

## Canonical areas

| Product area | Semantic path | Current target |
|---|---|---|
| Identity and Account | `identity-and-account/` | `v0.2.0` |
| Access Control | `access-control/` | `v0.1.0` |
| Member Management | `member-management/` | `v0.1.0` |
| Map Decision Support | `map-decision-support/` | `v0.2.0` |
| Resource Stations | `resource-stations/` | `v0.1.0` |
| Task Management | `task-management/` | `v0.1.0`; guest privacy targets `v0.2.0` |
| Emergency Announcements | `emergency-announcements/` | `v0.2.0` |

Links are added when each area has a real `README.md`; do not create empty area placeholders.

## Historical name mapping

These names exist only to diagnose old references. They are not canonical paths.

| Historical name | Canonical area / Feature |
|---|---|
| `01-auth` | `identity-and-account` / `IAM-FEAT-001` |
| `02-user-profile` | `identity-and-account` / `IAM-FEAT-002` |
| `03-user-settings` | `identity-and-account` / `IAM-FEAT-003` |
| `04-rbac` | `access-control` / `AC-FEAT-001` |
| `05-member-management` | `member-management` / `MEM-FEAT-001` |
| `06-map-decision-support` | `map-decision-support` / `MAP-FEAT-001` |
| `07-resource-station` | `resource-stations` / `RS-FEAT-001` |
| `08-ticket-management` | `task-management` / `TM-FEAT-001` through `TM-FEAT-006` |
| `09-emergency-announcement` | `emergency-announcements` / `EA-FEAT-001` |
| `10-guest-ticket-privacy` | `task-management` / `TM-FEAT-003` |
