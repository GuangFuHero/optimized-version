---
feature: TM-FEAT-003
title: Guest task privacy
status: Draft
owner: Product Owner
target_version: v0.2.0
---

# TM-FEAT-003: Guest task privacy

## Outcome

Unauthenticated visitors can understand general incident demand without locating or identifying a person who requested help.

## Delta

### Current behavior

Legacy evidence says only selected contact fields were masked while query filtering, precise location, free text, photos, and other response paths remained unresolved. This has not been freshly runtime-validated.

### Target behavior

Guest access first excludes non-public Tasks, then applies one consistent minimum-disclosure policy to every public response path.

## Scope

### In scope

- Guest query eligibility, free-text and media disclosure, contact masking, location precision, and response-path consistency.

### Out of scope

- Permissions for authenticated roles and the operational map experience.

### Affects

- Public map and task views, API outputs, photos, coordinates, free text, and Access Control.

## Open decisions

- **Q1 — Verification threshold:** May unverified or disputed public Tasks appear to guests? Blocks AC-01.
- **Q2 — Location precision:** What guest-safe aggregation or grid precision preserves utility without enabling household identification? Blocks AC-02.
- **Q3 — Photo disclosure:** Are photos always hidden, or may a reviewed and de-identified asset be public? Blocks AC-03.
- **Q4 — Safe summary ownership:** If free-text summaries are public, what produces and approves them? Blocks AC-03.

## Acceptance criteria

- **AC-01:** Guest list and single-item queries return only Tasks approved for public access and do not reveal excluded-item existence.
- **AC-02:** Guest responses never contain door-level coordinates.
- **AC-03:** Original free text, photos, review notes, creator identity, and raw contact details are not available to guests.
- **AC-04:** List, single-item, nested, mutation-response, export, and other Task paths apply the same guest boundary.
- **AC-05:** An authenticated, authorized user can still obtain the operational detail permitted by Access Control.

## References

- [Target Version](../../../../versions/v0.2.0.md)
- [Access Control](../../../access-control/README.md)
- [Archived source PRD](../../../../_archive/legacy-product-docs/task-management/10-guest-ticket-privacy/prd.md)

