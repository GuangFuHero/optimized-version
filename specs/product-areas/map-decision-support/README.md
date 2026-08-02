# Map Decision Support

**Status:** Definition

**Owner:** Product Owner

**Baseline:** Not released; no baseline `spec.md` exists.

## Minimum reading path

1. This file.
2. [Target Version v0.2.0](../../versions/v0.2.0.md).
3. [MAP-FEAT-001 Map decision support](./features/MAP-FEAT-001-map-decision-support/feature.md).

## Active Features

| Feature | Status | Target Version | Blocking issue |
|---|---|---|---|
| [MAP-FEAT-001 Map decision support](./features/MAP-FEAT-001-map-decision-support/feature.md) | Draft | [v0.2.0](../../versions/v0.2.0.md) | Zone collaboration, reassignment after boundary edits, sub-zones, and naming remain open. |

## Known conflicts

- The March 2026 GraphQL design is obsolete: the current schema is modular and uses per-request DataLoaders. A narrow code-derived snapshot is retained under the Feature's `engineering/`; the original is archived.
- Existing Backend closure-area APIs do not prove the complete Assignment Zone/Hazard Zone product contract. Runtime validation has not been performed.
