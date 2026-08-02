# Map Decision Support

**Status:** Definition

**Owner:** Product Owner

**Baseline:** Not released; no baseline `spec.md` exists.

## Minimum reading path

1. This file.
2. [Target Version v0.1.0](../../versions/v0.1.0.md) for Zone drawing, then [v0.2.0](../../versions/v0.2.0.md) for the surrounding map experience.
3. [MAP-FEAT-002 Zone drawing and effects](./features/MAP-FEAT-002-zone-drawing-and-effects/feature.md).
4. [MAP-FEAT-001 Map decision support](./features/MAP-FEAT-001-map-decision-support/feature.md).

## Active Features

| Feature | Status | Target Version | Blocking issue |
|---|---|---|---|
| [MAP-FEAT-002 Zone drawing and effects](./features/MAP-FEAT-002-zone-drawing-and-effects/feature.md) | Draft | [v0.1.0](../../versions/v0.1.0.md) | Boundary data, line buffers, multi-Team Zones, reassignment after boundary edits, sub-zones, and naming remain open. |
| [MAP-FEAT-001 Map decision support](./features/MAP-FEAT-001-map-decision-support/feature.md) | Draft | [v0.2.0](../../versions/v0.2.0.md) | Depends on Zone behavior delivered by `MAP-FEAT-002`. |

## Known conflicts

- The March 2026 GraphQL design is obsolete: the current schema is modular and uses per-request DataLoaders. A narrow code-derived snapshot is retained under `MAP-FEAT-001/engineering/`; the original is archived.
- Existing Backend work-zone and closure-area APIs do not prove the complete Assignment Zone/Hazard Zone product contract. Runtime validation has not been performed.
