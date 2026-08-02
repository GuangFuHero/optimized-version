---
feature: EA-FEAT-001
title: Emergency Announcements
status: Draft
owner: Product Owner
target_version: v0.2.0
---

# EA-FEAT-001: Emergency Announcements

## Outcome

Public visitors and response staff receive the highest-priority current message for their audience, while publishers can preview, target, expire, correct, and audit every announcement.

## Delta

### Current behavior

No released baseline or runtime-validated announcement contract is documented.

### Target behavior

- Announcements distinguish public and backstage channels, severity, content/instruction, effective and expiry time, optional geography/audience, acknowledgement requirement, and lifecycle status.
- Extreme, Severe, Moderate, and Minor severity produce distinct visual priority. Active public messages sort by severity then effective time; only one or two occupy the primary banner.
- Publishers can schedule, publish immediately, cancel early, and issue an updated version that supersedes rather than deletes the previous record.
- Public warnings can target geography; backstage coordination can target platform roles or Teams.
- Public warning publication is limited to Super Admin and Government. Team Admin can publish only backstage messages to their own Team.
- Backstage messages can require acknowledgement and expose confirmed/unconfirmed counts. Public warnings do not require per-user acknowledgement.
- Separate public and backstage previews show the final presentation before publishing.
- Expiry automatically removes active display; a manually removed message disappears from public and backstage surfaces within one minute. Publish/edit/remove actions are audited.

## Scope

### In scope

- Announcement data/lifecycle, severity presentation, scheduling/expiry, targeting, authority, acknowledgement, placement, preview, correction, and audit evidence.

### Out of scope

- Identity notification inbox integration until Q2 and notification Feature Q1 are jointly resolved.

### Affects

- Identity notifications, Map Decision Support, Access Control, Team context, and audit evidence.

## Open decisions

- **Q1 — Language scope:** Which languages beyond Chinese and English belong to v0.2.0? Blocks additional-language acceptance behavior.
- **Q2 — Notification integration:** Does a backstage announcement also create an IAM-FEAT-002 inbox item? Blocks cross-channel duplication and read semantics.
- **Q3 — Extreme-modal frequency:** Must returning visitors dismiss the same Extreme warning on every visit or once per defined period? Blocks repeated-interruption behavior.

## Acceptance criteria

- **AC-01:** An active public announcement appears at the top of the public surface for every visitor in its audience.
- **AC-02:** An active backstage announcement appears to authenticated recipients on their next open or refresh.
- **AC-03:** A publisher can separately preview the final public and backstage presentation before publishing.
- **AC-04:** A publisher can remove an announcement and it leaves active public/backstage display within one minute.
- **AC-05:** Create, edit, publish, update, cancel, and remove actions produce audit evidence.
- **AC-06:** Only Super Admin/Government can publish public warnings; Team Admin is limited to their Team's backstage channel, with interface and API enforcement.
- **AC-07:** Severity changes the public visual treatment according to the approved four levels.
- **AC-08:** A scheduled announcement activates at its effective time and leaves active display at expiry.
- **AC-09:** A backstage announcement requiring acknowledgement exposes confirmed and unconfirmed counts.
- **AC-10:** Concurrent public announcements sort by severity/time and only one or two occupy the primary placement.
- **AC-11:** Correcting an active announcement publishes an updated version, marks the old version superseded, and preserves the audit chain.

## Traceability

- Source PRD and user stories are archived; supporting evidence is under `research/`.
- [Target Version](../../../../versions/v0.2.0.md)
