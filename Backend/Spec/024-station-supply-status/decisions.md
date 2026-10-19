# Decisions: 024 Station Supply Status

Numbering continues the repo-wide ADR sequence. ADR-332 (`Spec/008-rbac-authorization`) was the last one taken
when this was written (2026-10-17); ADR-325 to ADR-331 are reserved for `Spec/023-backend-session-login`.

---

### ADR-333 A station carries a public, free-text supply status, stamped when it changes

> **Status: ACCEPTED (2026-10-17).** The product owner decided on 2026-10-17 that the prototype's 物資狀況 gets
> its own backend field, and approved the name, the timestamp and this folder.

**In plain words**: every station gets one public line saying what it is short of, for example
「飲用水見底、尿布尚有存量」, and the time that line last changed. Anyone signed in can suggest a new line, and a
reviewer merges it like any other suggested field.

**Context**: The designer's site prototype (`Design/前台/js/site/site-actions.jsx:45-47` on `sucrelindesign`)
offers six fields in its station "suggest an edit" form. Five map onto existing columns. The sixth, 物資狀況, is
free text with the hint 「缺什麼比有什麼更能驅動行動，優先寫缺的」, and no column holds it:

- `station_properties` rows `supply_types`, `supply_rationed` and `supply_condition` describe what a supply
  station hands out, not what it lacks. They exist only for the `supply` station type, and a suggestion can only
  target a property row that already exists.
- `comment` is the back office's internal note, behind `station.view_pii` since ADR-332.
- `description` already carries the prototype's 地址／位置說明.

**Decision**:

1. **Two columns on `stations`**: `supply_status` (text, nullable) and `supply_status_updated_at` (timestamptz,
   nullable). On the station rather than as a property: any station type can run short of something, and a
   suggestion needs a row to point at.
2. **Public.** `StationType.supplyStatus` and `supplyStatusUpdatedAt` need nothing beyond `station.view`. The
   point is that anyone looking at the map sees what a station needs.
3. **Written the ways other station fields are**, under the same capabilities:
   - `createStation` and `updateStation` take `supplyStatus` (`station.add`, `station.edit`).
   - It is a string entry in `SUGGESTABLE_FIELDS["station"]`: `station.contribute` suggests, `station.review`
     merges (ADR-300), `station.revoke` reverts. Suggestions keep their 1,000-character cap; direct writes are
     uncapped, like `description`.
4. **`supply_status_updated_at` moves only when the value actually changes**: on create when a value is given,
   on update, and on a merge. A revoke puts the previous stamp back. This is the `operational_status` and
   `status_changed_at` pattern, and the two share code: `services/suggestion.py` maps each stamped field to its
   stamp. A merge's change record keeps the old stamp under `<stamp>_before`. For `status_changed_at` that is
   the key merges already store, so revoking a merge made before this change still works.
   A value is stripped, and a blank one is stored as null (`normalize_supply_status` in
   `services/geo_validation.py`, on all three paths). Otherwise a form clearing the field with `""` would store
   a blank line and date it, and a blank sent on create would date a line that does not exist (#81 review,
   2026-10-19).
5. **History**: `supply_status` is public tier, like `op_hour`. `supply_status_updated_at` is excluded as a
   derived stamp, like `status_changed_at`.

**Consequences**:

- ➕ The site can show 「物資狀況：飲用水見底（3 小時前更新）」 and let the reader judge whether it still holds.
- ◾ Not in bulk import or export (Spec/015) yet: `bulk_columns.py` and `bulk_export.py` list their columns
  explicitly, so the new ones do not appear. Not searchable either: `search_text` is name and description only.
- ◾ A back-office review screen that labels fields by name needs a label for `supply_status`.
- ➖ The frontend needs a schema exported from a backend that has this change before it can show or suggest
  the field.
