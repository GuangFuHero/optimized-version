# Emergency Announcements product definition

## Purpose

Distribute time-sensitive public warnings and operational coordination messages with clear severity, audience, validity, authority, and auditability.

## Actors

- Super Admin and Government publishers issuing public warnings.
- Team Admin publishers coordinating within their own Team.
- Public visitors and authenticated operational users receiving messages.

## Product boundary

### In scope

- Public/backstage channels, severity, scheduling/expiry, geographic and role/Team targeting, acknowledgement, preview, correction, and audit evidence.

### Out of scope

- General personal notification-center behavior, owned by Identity and Account.
- Hazard geometry and map rendering, owned by Map Decision Support.

## Core principles

- Every announcement states audience, severity, effective window, and accountable publisher.
- Expired or corrected information leaves the active surface without erasing history.
- Public-warning authority is narrower than Team coordination authority.
