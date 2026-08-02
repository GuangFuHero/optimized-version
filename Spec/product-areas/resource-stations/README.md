# Resource Stations

**Status:** Definition

**Owner:** Product Owner

**Baseline:** Not released; no baseline `spec.md` exists.

## Minimum reading path

1. This file.
2. [Target Version v0.1.0](../../versions/v0.1.0.md).
3. [RS-FEAT-001 Resource Stations](./features/RS-FEAT-001-resource-stations/feature.md).

## Active Features

| Feature | Status | Target Version | Blocking issue |
|---|---|---|---|
| [RS-FEAT-001 Resource Stations](./features/RS-FEAT-001-resource-stations/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Contributor trust and automatic status-change threshold remain open; implementation contract is only partially aligned. |

## Known conflicts

- The legacy station mapping marked several nullable database fields as required and mixed desired catalog fields with implemented columns. A smaller code-derived mapping is retained under Feature engineering; the original is archived.
- The current suggestion table stores one proposed field per row and does not contain the PRD's explicit `base_version`/multi-field diff model. Optimistic-concurrency behavior therefore remains unverified.
