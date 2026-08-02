# Product spec governance handoff

**Date:** 2026-08-02

**Next owner:** Product Owner

## Objective

Keep Wanguard product areas stable while Features can be defined, validated, and released independently, then aggregated into an explicit Version manifest. Prevent a future Claude or other agent from recreating numbered product-area folders, mixing decisions into Flow, or treating historical engineering checklists as release evidence.

## Canonical reading path

1. Read repository [`README.md`](../../README.md), [`AGENTS.md`](../../AGENTS.md), and [`specs/README.md`](../../specs/README.md).
2. Open the responsible [product-area README](../../specs/product-areas/README.md).
3. Read its Target Version and only the responsible Feature.

Before changing product documents, follow the repo-local `manage-product-spec` and `derive-feature-spec` skills. `CLAUDE.md` intentionally points to `AGENTS.md` rather than duplicating governance.

## Migrated structure

- Version manifests: [`v0.1.0`](../../specs/versions/v0.1.0.md) and [`v0.2.0`](../../specs/versions/v0.2.0.md).
- Stable areas: Identity and Account, Access Control, Member Management, Map Decision Support, Resource Stations, Task Management, and Emergency Announcements under [`specs/product-areas/`](../../specs/product-areas/README.md).
- Task Management is split into `TM-FEAT-001` through `TM-FEAT-006`; Custom Fields owns its Spec, pure Flow, unchecked validation, and wireframes.
- Original PRDs, User Stories, decision discussion, old Version entry pages, cross-area journey, and stale/unreconciled engineering files are retained under [`specs/_archive/`](../../specs/_archive/README.md).
- The former `specs/v1.0.0/` and `specs/v2.0.0/` trees no longer exist as active paths.

## Approved decisions

- Product areas use semantic slugs; numeric `01-10` prefixes are historical aliases only.
- Versions are manifests and never containers for product areas or Features.
- Version identifiers use SemVer: early trials start at `v0.1.0`; do not use `v0.0.0`; `v1.0.0` requires an explicitly approved stable contract.
- A Feature may independently reach Released and immediately update its product-area baseline; a formal Version aggregates released Features later.
- Feature status never advances to Ready, Validated, or Released without the documented Owner and evidence gates.
- Open decisions live only in the owning `feature.md`; Flow describes sequence and cites existing Spec rules.
- Task Management binding decisions D4, D7, and D9-D16 are canonical in [`decisions.md`](../../specs/product-areas/task-management/decisions.md); the complete D1-D16 discussion remains non-canonical history.

## Blocking Open decisions

- `TM-FEAT-001`: change awareness, duplicate prevention, reactivation state, enforcement moment, mid-form deactivation, concurrent edits, type correction, group rollback, large-form organization, shared field identity, and read-only visibility.
- `TM-FEAT-002`: self-acceptance versus coordinator dispatch, responder identity, multiple assignees, and reassignment authority.
- `TM-FEAT-003`: public verification threshold, guest location precision, photo disclosure, and safe-summary ownership.
- `TM-FEAT-004`: intake-source contract, citizen minimum data, tracking proof, and Ticket/Task status semantics.
- `TM-FEAT-005`: early-trial boundary, priority vocabulary and authority, timer contract, and escalation.
- `TM-FEAT-006`: early-trial boundary, duplicate semantics, building identity, group responsibility, and reversal.
- Access Control and Member Management retain their own Feature-local release blockers; do not resolve them from Task Management documents.

## Version scope

- `v0.1.0` early trial: Access Control, Member Management, Resource Stations, and Task Management Features `TM-FEAT-001`, `002`, `004`, `005`, and `006`.
- `v0.2.0`: Identity and Account, Map Decision Support, Emergency Announcements, and `TM-FEAT-003` Guest task privacy.
- Inclusion in a manifest does not imply Ready or Released. All six Task Management Features are currently Draft.

## Validation evidence

Executed from repository root on 2026-08-02:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tests/verify-specs.tests.ps1
# PASS: 13 verifier tests

powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-specs.ps1
# PASS: product spec governance checks; 0 allowed migration blocker(s).

git diff --check
# Exit 0; no output.

rg -n --glob '!specs/_archive/**' --glob '!docs/superpowers/**' --glob '!docs/product-spec-migration-inventory.md' "specs/v1\.0\.0|specs/v2\.0\.0" .
# ACTIVE_OLD_PATH_MATCHES=0
```

The strict validator was run without `-AllowMigrationBlockers`; the temporary blocker registry has been removed.

## Runtime validation

Runtime product validation was not performed. No Feature was promoted because of this documentation migration, and no validation checkbox was marked as passing without immutable-build evidence.

## Next decision

The Product Owner should resolve `TM-FEAT-002` assignment model and responder identity first because they define who may take responsibility for early-trial Tasks and must align with Member Management and Access Control. After that decision, derive only the approved assignment Spec and validation coverage; do not reuse the archived volunteer-dispatch contract as an answer.

