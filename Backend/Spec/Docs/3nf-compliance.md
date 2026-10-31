# Database normal forms: what conforms, and the redundancy we keep on purpose

The tender asks for a database in third normal form (3NF). This document is the acceptance statement: the
standard we checked against, the five places that did not conform and how they were fixed, the
redundancy we keep on purpose and what keeps it consistent, and SQL to check a deployed database.

The audit was done on `main` at `023bb069` (2026-10-28), reading `Backend/app/models/` and
`Backend/alembic/versions/`; three more fixes (F6 to F8) were made on 2026-10-30. Paths below are
relative to `Backend/`.

## Result

- Every table is in 3NF, except for the deliberate redundancies listed under
  [Kept on purpose](#kept-on-purpose-controlled-redundancy). Each of those is kept consistent by the
  database itself (a constraint or a generated column) or by a single function that is the only writer.
- Five places did not conform and are fixed: `stations.is_official` (F1, ADR-438), `notifications.read`
  (F2, ADR-439), and, in migration `197c174410bd` (ADR-440), `user_role_assign.role_kind` (F6), the
  timestamps of `ticket_tasks` (F7) and the address line of `secondary_locations` (F8). All are now
  enforced by the database.
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

### F6 `user_role_assign.role_kind` copied `roles.kind` (ADR-440, reverses ADR-073)

- **Was**: `role_uuid → role_kind` (equal to `roles.kind`), kept so a CHECK could see the role's kind, with a
  composite foreign key `(role_uuid, role_kind) → roles(uuid, kind)` stopping the copy from drifting. A
  second copy of the fact, and part of the candidate key `(user_uuid, role_uuid, team_uuid)`, so strictly a
  2NF and 3NF violation. This was listed as the controlled redundancy E1.
- **Now**: the column, `ck_ura_role_team_kind`, `fk_ura_role_kind` and `roles.uq_roles_uuid_kind` are gone.
  Two triggers keep the rule "a platform grant carries no team, a team grant carries one":
  `user_role_assign_check_kind_trigger` (BEFORE INSERT OR UPDATE OF `role_uuid`, `team_uuid`) reads the
  role's kind with `SELECT … FOR SHARE` and raises `check_violation` for `ck_ura_role_team_kind`, so callers
  still get an IntegrityError; `roles_kind_in_use_trigger` (BEFORE UPDATE OF `kind`) refuses a change of
  kind while any grant holds the role. The `_fill_role_kind` hook and every `role_kind=` are removed.
- **Tests**: `tests/test_identity_model.py`.

### F7 `ticket_tasks.completed_at` and `canceled_at` agree with `status` (ADR-440)

- **Was**: `completed_at` is set when `status` becomes `fulfilled` and `canceled_at` when it becomes
  `canceled`, by the actions that move the status (`app/services/ticket.py`, `app/services/dedup_resolve.py`).
  The database did not check it: a transitive dependency `status → completed_at, canceled_at`.
- **Now**: `CHECK ck_ticket_tasks_stamps_match_status`: `completed_at` is set exactly when the status is
  `fulfilled`, `canceled_at` exactly when it is `canceled`. Every writer already kept this: filling, giving a
  place back, stopping recruitment, deletion, and a duplicate review's cancel and settle. The migration
  reports how many rows disagreed, repaired them from the status (stamping with `updated_at`), then added the
  CHECK.
- **Tests**: `tests/test_ticket_task_stamps.py`, `tests/test_migration_third_normal_form.py`.

### F8 `secondary_locations.full_address` and the address parts (ADR-440)

- **Was**: `full_address` was the parser's version of the line and the nine parts were its split, both stored;
  text the parser did not place existed only in the line. A 衖 or 衕 was in the line and in no part.
- **Now**: `user_input_address` (500 characters) holds the line as received, outer whitespace trimmed (overwritten by an edit that changes the address; sending back a line that splits into the stored parts keeps it, unless the edit clears or changes a 棟/樓/室 the stored line names).
  `apply_address` parses it and writes the parts and `remainder`, the text the parser could not place (after
  the 號 when that is not 棟/樓/室, or the whole line when nothing was recognized). `full_address` is
  `GENERATED ALWAYS AS (…) STORED`: county, town, village, neighborhood, road, section, lane, alley, no and
  remainder joined, NULL when all are NULL. The parser keeps a 衖/衕 inside `alley` (`3弄2衖`), so the
  rebuilt line is, for every input, the line the parser returned before. The API is unchanged.
- **Rows from before**: they never stored the raw input, so their `user_input_address` is the parsed line
  that was in `full_address`. A row left with parts and no line by an earlier rename keeps its parts and a NULL
  `user_input_address`; its generated line is built from those parts.
- **What is left**: the parts still follow from `user_input_address` through a Python parser; see E2.
- **Tests**: `tests/test_address_parse.py` (the parts join to the line, over every case in the file and a
  generated set), `tests/test_address_service.py`, `tests/test_migration_third_normal_form.py`.

## Kept on purpose (controlled redundancy)

Each entry: the dependency, why it is kept, what keeps it consistent, and the sentence for acceptance.

### E1 was `user_role_assign.role_kind`

Removed: see F6.

### E2 the address parts derived from `user_input_address` (the one remaining exception)

- **Dependency**: `user_input_address → county, town, village, neighborhood, road, section, lane, alley, no,
  remainder`, through `parse_tw_address` (`app/core/address.py`). `full_address` is no longer part of it: the
  database builds it from those columns, so it cannot disagree with them (F8).
- **Why**: search and the bulk import's match keys use the split columns. Splitting needs the Python parser,
  so it cannot be a SQL view or a generated column.
- **Consistency**: every write goes through one function, `apply_address` (`app/services/address.py`), which
  keeps the line as received and overwrites the parts and `remainder`. The GraphQL inputs do not take them.
  A ticket inside a building copies the building's already-split address.
- **Guards for a parser change or a direct SQL write**: `scripts/resplit_addresses.py` re-parses
  `user_input_address` for every row and prints what would change (`--apply` writes it, and also fills an empty
  棟/樓/室 column the line carries, never overwriting a filled one);
  `scripts/check_address_drift.py` lists the rows whose stored parts differ from a re-parse (or that have an
  empty 棟/樓/室 column the line carries) and exits 1 if there are any. Both need Python, since SQL cannot run the parser. A row with parts but no line (left by an
  earlier rename) has nothing to re-parse: the upgrade keeps its parts and leaves `user_input_address` NULL, the
  re-split leaves it alone, and both scripts list it as parts-only, which is not drift (the check still exits 0).
- **Tests**: `tests/test_address_service.py`, `tests/test_address_parse.py`, `tests/test_address_tools.py`.
- **Acceptance**: derived columns of the raw address line, written by one function only, used for search and
  matching, with a command to re-derive them and a check that finds a row where they disagree.

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
  `(item_uuid, station_uuid) → station_properties(uuid, station_uuid)` on `crowd_sourcing`.

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

-- F6: grants whose team disagrees with the role's kind (the triggers keep this at 0)
SELECT count(*)
FROM user_role_assign u JOIN roles r ON r.uuid = u.role_uuid
WHERE (r.kind = 'platform' AND u.team_uuid IS NOT NULL) OR (r.kind = 'team' AND u.team_uuid IS NULL);

-- F7: needs whose timestamps disagree with their status (the CHECK keeps this at 0)
SELECT count(*) FROM ticket_tasks
WHERE NOT ((completed_at IS NOT NULL) = (status = 'fulfilled')
           AND (canceled_at IS NOT NULL) = (status = 'canceled'));

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

E2 (the split addresses) cannot be checked in SQL: run `python -m scripts.check_address_drift` from
`Backend/`, which re-parses `user_input_address` on each row and lists the rows whose parts differ.

## Keeping it true

- A new column that can be worked out from another column of the same row should be a generated column,
  or be listed above with what keeps it consistent.
- A copy of another table's value kept for a CHECK is a second copy of the fact: do not keep one; read the
  source row in a trigger, as F6 does.
- A snapshot of a value at the time of an event is not a violation; say so in the column's comment.
