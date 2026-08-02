# Registered migration blockers

This temporary registry lists only pre-existing legacy paths that are allowed to fail governance checks while their content is being migrated. `-AllowMigrationBlockers` matches the error code and path exactly, or by an explicit `/*` prefix. New product-area errors are never covered.

| Code | Path | Reason | Removal task |
|---|---|---|---|
| BROKEN_LINK | `v1.0.0/*` | Version-owned numbered documents still contain historical wiki references; each source exits this path during Tasks 5-7. | Tasks 5-7 |
| BROKEN_LINK | `v2.0.0/*` | Legacy roadmap navigation still references the numbered structure. | Task 8 |
| BROKEN_LINK | `_shared/user-journey.md` | Cross-area journey still uses the historical Task Management name. | Task 8 |
| BROKEN_LINK | `_shared/research/multitenancy-rls-breakglass-patterns.md` | Shared research still uses historical Identity naming. | Task 8 |
