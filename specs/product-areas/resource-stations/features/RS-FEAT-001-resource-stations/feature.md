---
feature: RS-FEAT-001
title: Resource Stations
status: Draft
owner: Product Owner
target_version: v0.1.0
---

# RS-FEAT-001: Resource Stations

## Outcome

Residents and response teams can find current resource locations, while authorized maintainers can review corrections and preserve a trustworthy history without blocking urgent operating-status updates.

## Delta

### Current behavior

The Backend contains station, station-property, suggestion, and soft-delete structures, but no released product baseline or immutable runtime validation is documented.

### Target behavior

- One station source powers both table and map views. Users can filter by region, type, establishment time, and operating status and retain filters when switching views.
- Public edits are proposals and do not overwrite approved data before review. Reviewers compare current and proposed values and can approve, reject, or adjust.
- Approval detects when the reviewed base has changed and refuses a blind overwrite; non-conflicting fields may merge only under an explicit rule.
- Every CRUD decision is visible in a field-level history with actor and time. Deletion is reversible soft deletion; rollback creates another history entry.
- Authorized operational users can update open/paused/closed/full status immediately. Public status reports keep source provenance and follow the threshold resolved by Q2.
- Resource Stations are public information. Exports can scope to a responsibility area, include CSV and an offline-readable form, and display an export/freshness timestamp.
- Large map sets cluster; coordinate-derived administrative area governs filtering when an entered address disagrees.

## Scope

### In scope

- Station data stewardship, views/filters, proposals and review, conflict protection, history, operational status, permissions boundary, and offline export.

### Out of scope

- Zone drawing, general map layers, and trust automation until Q1 is resolved.

### Affects

- Map Decision Support, Access Control, notification behavior, station GraphQL/models, and field exports.

## Open decisions

- **Q1 — Contributor trust:** Should high-trust contributors automatically pass low-risk changes in a later Version? Blocks trust-tier automation only.
- **Q2 — Public status threshold:** How many consistent reports, over what time/identity boundary, can update operational status automatically? Blocks automatic public status updates.

## Acceptance criteria

- **AC-01:** Table filters for region, type, establishment time, and operating status can combine and update the result.
- **AC-02:** Reviewers can compare current and proposed values and approve, reject, or adjust a suggestion.
- **AC-03:** A completed review becomes visible to public readers within one minute.
- **AC-04:** Switching between table and map retains the current filters.
- **AC-05:** Only Super Admin can soft-delete a station; other roles lack the control and the API refuses the request.
- **AC-06:** Every station CRUD operation produces visible history with actor, timestamp, and changed fields.
- **AC-07:** A public suggestion remains separate from approved station data until approval.
- **AC-08:** Review is stopped when its base has changed and cannot blindly overwrite a newer approved value.
- **AC-09:** A soft-deleted station retains its identity/history and can be reactivated.
- **AC-10:** Authorized operational users can change operating status immediately without the normal data-review queue.
- **AC-11:** Each export states when the data was exported or last current.
- **AC-12:** Every role can view public resource stations, while responsibility-area filtering is available for applicable exports.

## Traceability

- [Verified station field mapping](./engineering/mapping-stations.csv)
- Source PRD and user stories are archived; supporting evidence is under `research/`.
- [Target Version](../../../../versions/v0.1.0.md)
