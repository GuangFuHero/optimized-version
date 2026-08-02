# Map Decision Support product definition

## Purpose

Give disaster-response coordinators one spatial workspace for understanding operational conditions, drawing responsibility and hazard boundaries, and making rapid assignment decisions.

## Actors

- Government and Super Admin users defining operational areas.
- Team Admin and Team Member users viewing assigned responsibility areas.
- Data Auditor and response staff using shared decision layers.

## Product boundary

### In scope

- Operational map layers, spatial drawing, Zone lifecycle, geometry safety, assignment/hazard effects, and weak-network behavior.

### Out of scope

- Resource-station data stewardship, owned by Resource Stations.
- Task lifecycle and assignment policy, owned by Task Management.
- Authorization rules, owned by Access Control.

## Core principles

- Responsibility Zones and Hazard Zones have distinct meanings and effects.
- Spatial decisions must preview affected objects and preserve an auditable recovery path.
- Geometry validity, performance, and weak-network degradation are product behavior, not implementation afterthoughts.
