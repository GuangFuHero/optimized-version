---
feature: IAM-FEAT-002
title: User profile, notifications, and preferences
status: Draft
owner: Product Owner
target_version: v0.2.0
---

# IAM-FEAT-002: User profile, notifications, and preferences

## Outcome

Users can understand their identity and work context, notice relevant activity without notification overload, and retain useful preferences across devices.

## Delta

### Current behavior

No released baseline is documented.

### Target behavior

- Opening the product refreshes an unseen count; while open, a lightweight count-only poll runs every 60 seconds normally and every 15-30 seconds during disaster activation, with jitter.
- Opening the notification list clears the unseen badge without marking every item read. Opening an item marks that item read; users can mark all read explicitly.
- Task progress, data-review results, and role-elevation results are separate notification types. Repeated task updates for one task can aggregate; one-time results remain separate.
- Notifications retain 90 days and deep-link to their owning object.
- The profile displays name, optional nickname, phone, Email, and assigned operational role.
- Pinned layers, pinned stations, and watched task types persist on the server across devices. Deleted targets remain stored by ID but are skipped safely when rendered.

## Scope

### In scope

- Profile identity display, notification inbox behavior, and cross-device work preferences.

### Out of scope

- The domain rule that generates each notification.
- Native push notification delivery.

### Affects

- Task Management, Resource Stations, Access Control, Member Management, Map Decision Support, and Emergency Announcements.

## Open decisions

- **Q1 — Notification scope:** Should emergency announcements, Zone/Hazard activity, and review-queue badges enter this inbox or remain in their owning interfaces? Blocks additional notification types beyond the three approved types.

## Acceptance criteria

- **AC-01:** Opening an application page refreshes the unseen notification count without manual refresh.
- **AC-02:** Each supported notification shows its type, event summary, and timestamp.
- **AC-03:** The profile displays name, phone, Email, and assigned operational role, with nickname optional.
- **AC-04:** Pinned layers and stations are restored after the user signs in on another device.
- **AC-05:** Notification behavior works in supported Safari and Chrome versions.
- **AC-06:** Opening the notification list clears only the unseen badge; individual items remain unread until opened or explicitly marked read.
- **AC-07:** Multiple task updates for one task in a short period aggregate into one counted notification.
- **AC-08:** Each notification deep-links to the corresponding task, review result, or role section.
- **AC-09:** Server-stored preferences ignore deleted targets without producing a user-visible error.
- **AC-10:** Polling uses the approved normal and disaster intervals with jitter.

## Traceability

- Source behavior is preserved in archived legacy PRD and user stories; supporting evidence is under `research/`.
- [Target Version](../../../../versions/v0.2.0.md)
