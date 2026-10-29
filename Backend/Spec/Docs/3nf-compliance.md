# Database normal forms: what conforms, and the redundancy we keep on purpose

The tender asks for a database in third normal form (3NF). This document is the acceptance statement: the
standard we checked against, the two places that did not conform and how they were fixed, the
redundancy we keep on purpose and what keeps it consistent, and SQL to check a deployed database.

The audit was done on `main` at `023bb069` (2026-10-28), reading `Backend/app/models/` and
`Backend/alembic/versions/`. Paths below are relative to `Backend/`.

## Result

- Every table is in 3NF, except for the deliberate redundancies listed under
  [Kept on purpose](#kept-on-purpose-controlled-redundancy). Each of those is kept consistent by the
  database itself (a constraint or a generated column) or by a single function that is the only writer.
- Two places did not conform and are fixed: `stations.is_official` (F1, ADR-438) and
  `notifications.read` (F2, ADR-439). Both are now enforced by the database.
- Two duplications are known and low risk, and are not yet enforced by the database (F3, F4). One more is
  suspected and waits for the slow dedup layer (F5). See
  [Known, not yet constrained](#known-not-yet-constrained).

## The standard

- **1NF**: every field holds one value; no repeating groups.
- **2NF**: 1NF, and every non-key column depends on the whole of each candidate key, not on part of it.
- **3NF**: 2NF, and no non-key column depends on another non-key column (no transitive dependency).
  Formally: for every non-trivial functional dependency X → A, either X is a superkey or A is part of a
  candidate key.

How it was applied:

- Every table has a surrogate primary key `uuid` (`app/models/base.py`). With that key alone 2NF always
  holds, so the natural keys declared as UNIQUE constraints or unique indexes were checked as candidate
  keys too, for example `(user_uuid, role_uuid, team_uuid)` on `user_role_assign`.
- A functional dependency was counted only where the code or the spec makes one column determine another:
  who writes the column, and from what. Data was not used to infer dependencies.
- JSON documents and arrays that hold one value as a whole (a snapshot, an engine's evidence) count as one
  value. Lists of values of one domain (tags, enum options, disaster types) are listed as a 1NF exception
  (E6).
- Polymorphic references (`ref_type` + `ref_uuid` on photos, notifications, suggestions, dedup pairs) do
  not violate 3NF: the type is the only thing telling the database which table the uuid belongs to.
- Entity–attribute–value tables (`task_properties`, `station_properties`, `ticket_disaster_details`) are in
  3NF: each row is one (entity, attribute, value).

## Fixed

### F1 `stations.is_official` is computed from `stations.source` (ADR-438)

- **Was**: `is_official` and `source` both said whether a station is official. Only the seed wrote
  `is_official`, so a station made in the back office had `source = 'official'` and `is_official = false`:
  a transitive dependency `uuid → source → is_official`, and already inconsistent.
- **Now**: migration `af6e25b0d8db` makes `is_official` a generated column,
  `GENERATED ALWAYS AS (COALESCE(source = 'official', false)) STORED`. Nothing can write it.
  `source` holds `user`, `official` or NULL, enforced by `CHECK ck_stations_source`. The migration folded
  the old values: `gov`, `import`, `official` or a row marked official became `official`; `user` stayed;
  anything else became NULL.
- **Who sets `source`**: the backend, from the identity making the station: `official` for a back-office
  identity, `user` for the site's (`app/services/source.py`). What a form sends is ignored.
- **Tests**: `tests/test_migration_station_official_from_source.py`,
  `tests/test_graphql/test_source_by_identity.py`.

### F2 `notifications.read` agrees with `notifications.read_at` (ADR-439)

- **Was**: `read` equals `read_at IS NOT NULL`, a transitive dependency. Both writers set both columns
  (`app/repositories/notification_repository.py`), but the database did not check it.
- **Now**: migration `9dd1f61063fe` adds `CHECK ck_notifications_read_matches_read_at`:
  `read = (read_at IS NOT NULL)`. `read` stays because the unread-count index
  `ix_notifications_recipient_unread` is built on it.
- **Tests**: `tests/test_migration_notification_read_check.py`.

## Kept on purpose (controlled redundancy)

Each entry: the dependency, why it is kept, what keeps it consistent, and the sentence for acceptance.

### E1 `user_role_assign.role_kind`

- **Dependency**: `role_uuid → role_kind` (equal to `roles.kind`). It is part of the candidate key
  `(user_uuid, role_uuid, team_uuid)`, so strictly this breaks both 2NF and 3NF.
- **Why**: a CHECK must ensure that a platform role carries no team and a team role always does
  (ADR-073), and a CHECK cannot read another table, so the kind is copied here.
- **Consistency**: a composite foreign key `(role_uuid, role_kind) → roles(uuid, kind)` rejects a wrong
  copy; the model fills it in before flush when a caller leaves it out (`app/models/rbac.py`).
- **Tests**: `tests/test_identity_model.py` (a wrong copy is refused; the copy is filled in).
- **Acceptance**: controlled redundancy, enforced by a foreign key to its source; an update anomaly cannot
  happen.

### E2 the split address columns of `secondary_locations`

- **Dependency**: `full_address → county, town, village, neighborhood, road, section, lane, alley, no`.
  The reverse does not hold: text the parser does not recognise stays only in `full_address`.
- **Why**: search and the bulk import's match keys use the split columns. Splitting needs the Python parser
  (`app/core/address.py`, `parse_tw_address`), so it cannot be a SQL view or a generated column.
- **Consistency**: every write goes through one function, `apply_address` (`app/services/address.py`), which
  splits `full_address` and overwrites the nine columns. The GraphQL inputs do not take the nine columns.
  A ticket inside a building copies the building's already-split address.
- **Tests**: `tests/test_address_service.py`, `tests/test_address_parse.py`.
- **Risk**: a parser change does not re-split old rows; a direct SQL write could disagree. Checking existing
  rows needs Python (re-run `parse_tw_address` on each row); SQL cannot do it.
- **Acceptance**: derived columns of the full address, written by one function only, used for search and
  matching.

### E3 the `search_text` generated columns

- **Tables**: `stations`, `tickets`, `ticket_tasks`, `task_properties`, `station_properties`,
  `secondary_locations`.
- **Consistency**: `GENERATED ALWAYS AS (...) STORED`; the database computes the value and nobody can write
  it.
- **Tests**: `tests/test_search_schema.py`.
- **Acceptance**: part of the keyword-search index; maintained by the DBMS, so it cannot disagree with its
  source columns. Since F1, `stations.is_official` is in the same category.

### E4 statuses derived from child rows (not a 3NF violation)

- **What**: `tickets.status` (pending, in_progress, completed) is derived from the ticket's live needs and
  whether anyone claimed one; `cancelled` is a separate fact. `ticket_tasks.status` becomes `fulfilled`
  when its claims reach its quantity and goes back to `pending` when one leaves.
- **Why it is not a 3NF violation**: 3NF concerns dependencies within one row. This is an aggregate over
  other rows. It is still redundant, so it is listed.
- **Why not a view**: the stored value is not a pure function of the children: a ticket with no needs yet
  is `pending`, while one whose needs were all deleted is `completed`.
- **Consistency**: every action that changes a need or a claim locks the ticket row and calls
  `recompute_ticket_status` (`app/services/ticket_status.py`) in the same transaction. `update_ticket`
  does not take a status, and `update_ticket_task` refuses one.
- **Tests**: `tests/test_ticket_status.py`, `tests/test_volunteer_claim.py`,
  `tests/test_delete_ticket_task.py`, `tests/test_add_ticket_task.py`.
- **Acceptance**: a workflow status, recomputed by one function in the same transaction as the change; the
  appendix SQL lists any ticket whose stored status differs from the derived one.

### E5 history snapshots (not a 3NF violation)

A snapshot depends on the event row, not on the current value of what it refers to, so there is no
transitive dependency:

- `audit_logs.old_values`, `new_values`, `context`, written by a database trigger (`app/db/triggers.py`).
- `dedup_audit_events` (before and after state, evidence), append-only.
- `station_suggestion_merges.changes`: each field's before and after, written back on revoke.
- `tickets.audited_content`: the content at the time of the data check.
- `role_requests.applicant_name`, `applicant_phone`, `applicant_email`: the applicant's details when they
  applied.
- `crowd_sourcing.user_credibility_score`: the score when the rating was given.
- `notifications.title`, `body`: the text as sent.
- A ticket inside a building: the address and point copied from the building when it was filed.

**Acceptance**: audit and history records; the business needs the value as it was, not the current one.

### E6 arrays and JSON lists (1NF exception)

- **Arrays**: `tickets.disaster_types`, `project_settings.disaster_types` and the `disaster_types` of the
  three property-config tables. The values are `disaster_types.key`; there is no foreign key, and writes
  are checked by `app/core/disaster_types.py`.
- **JSON lists**: `briefing_templates.tags`, `briefings.tags`, the configs' `enum_options`,
  `building_maps.floor_areas`.
- **Why**: one event often has several disaster types and queries intersect arrays (ADR-246); tags must be
  added without a schema change; enum options are form definitions.
- **Risk**: no foreign key, so a renamed area or retired key is not followed; disaster type keys may not be
  renamed.
- **Acceptance**: PostgreSQL arrays and jsonb are single values of one type; these hold labels and form
  options, checked on write. Converting them to junction tables would change the API, queries and duplicate
  matching, and is not planned.

## Known, not yet constrained

These are low-risk duplications with a single writer each. Each can be closed with one migration that adds
a constraint, without changing code or the API.

### F3 `crowd_sourcing.station_uuid` repeats the item's station

- **Dependency**: the candidate key is `(user_uuid, item_uuid)`; the `station_properties` row `item_uuid`
  points at already holds `station_uuid`. That is a partial dependency (2NF) and a transitive one (3NF).
- **Consistency today**: the service checks the item belongs to the station before writing
  (`app/services/station.py`); the database does not.
- **Fix when wanted**: UNIQUE `(uuid, station_uuid)` on `station_properties`, and a composite foreign key
  `(item_uuid, station_uuid) → station_properties(uuid, station_uuid)` on `crowd_sourcing`, as E1 does.

### F4 `role_requests.team_uuid` repeats the invite's team

- **Dependency**: an invite belongs to one team and cannot change; a request made through an invite takes
  that team. So for rows with `invite_uuid`, `uuid → invite_uuid → team_uuid`. The database checks only that
  a request with an invite has a team.
- **Fix when wanted**: UNIQUE `(uuid, team_uuid)` on `team_invites`, and a composite foreign key
  `(invite_uuid, team_uuid) → team_invites(uuid, team_uuid)` on `role_requests`.

### F5 `duplicate_pairs.method` may determine `source_layer` (suspected)

- `method` looks finer than `source_layer` (`fast_rule` → `fast`, `slow_*` → `slow`, `manual` → `manual`).
  Today the only writer sets `fast_rule` and `fast`, so there is one combination.
- **Decide with the slow layer**: either a CHECK fixing the pairing, or drop `source_layer` from the pairs.

## Checking a deployed database

Read-only; run each inside `BEGIN READ ONLY; … ROLLBACK;`. On 2026-10-29 staging returned: F1 17 `gov` and
10 `user` (before the migration), F2 0 mismatches out of 229.

```sql
-- F1: after af6e25b0d8db only user, official or NULL, and is_official true exactly for official
SELECT s.source, s.is_official, count(*)
FROM stations s JOIN base_geometries g ON g.uuid = s.uuid
WHERE g.delete_at IS NULL
GROUP BY 1, 2 ORDER BY 1, 2;

-- F2: notifications whose read disagrees with read_at (the CHECK keeps this at 0)
SELECT count(*) FROM notifications WHERE read <> (read_at IS NOT NULL);

-- F3: ratings whose station is not their item's station (expected 0)
SELECT count(*)
FROM crowd_sourcing c JOIN station_properties p ON p.uuid = c.item_uuid
WHERE p.station_uuid <> c.station_uuid;

-- F4: requests whose team is not their invite's team (expected 0)
SELECT count(*)
FROM role_requests r JOIN team_invites i ON i.uuid = r.invite_uuid
WHERE r.team_uuid IS DISTINCT FROM i.team_uuid;

-- E1: role_kind different from roles.kind (the foreign key keeps this at 0)
SELECT count(*)
FROM user_role_assign u JOIN roles r ON r.uuid = u.role_uuid
WHERE u.role_kind <> r.kind;

-- E4: stored ticket status different from the derived one (cancelled tickets and tickets that never
-- had a need are left out)
SELECT * FROM (
  SELECT t.uuid, t.status AS stored,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM ticket_tasks k
        WHERE k.ticket_uuid = t.uuid AND k.delete_at IS NULL
          AND k.status IN ('pending', 'in_progress')
      ) THEN 'completed'
      WHEN EXISTS (
        SELECT 1 FROM task_assignments a JOIN ticket_tasks k ON k.uuid = a.task_uuid
        WHERE k.ticket_uuid = t.uuid AND k.delete_at IS NULL
      ) THEN 'in_progress'
      ELSE 'pending'
    END AS derived
  FROM tickets t JOIN base_geometries g ON g.uuid = t.uuid
  WHERE g.delete_at IS NULL AND t.status <> 'cancelled'
    AND EXISTS (SELECT 1 FROM ticket_tasks k WHERE k.ticket_uuid = t.uuid)
) x
WHERE stored <> derived;
```

E2 (split addresses) cannot be checked in SQL: re-run `parse_tw_address(full_address)` from
`app/core/address.py` on each row in Python and compare the nine columns.

## Keeping it true

- A new column that can be worked out from another column of the same row should be a generated column,
  or be listed above with what keeps it consistent.
- A copy of another table's value kept for a CHECK should use a composite foreign key, as E1 does.
- A snapshot of a value at the time of an event is not a violation; say so in the column's comment.
