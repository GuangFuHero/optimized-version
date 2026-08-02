# Product Spec Migration Inventory

**Recorded:** 2026-08-02  
**Source commit:** `dffc362dbc33260dc754a964b5af0785e922b972`  
**Working branch:** `docs/prd`

This inventory is the migration ledger for the product-spec governance restructure. It records where every legacy product area and engineering artifact will go. A move is not complete until the target exists, links are repaired, and `scripts/verify-specs.ps1` passes or reports only an explicitly registered migration blocker.

## Protected working-tree change

The following pre-existing change belongs to the user and must be preserved as one logical move:

| Git state | Path | Protection |
|---|---|---|
| deleted | `specs/v1.0.0/08-ticket-management/wireframe/flow.md` | Do not restore independently. |
| untracked | `specs/v1.0.0/08-ticket-management/flow.md` | Canonical source for the future `TM-FEAT-001-custom-fields/flow.md`. SHA-256: `F38DD0DFD1CD2ECA0EB596575ADEB986D6FA99A8E46B1C75A3EF59C50C05B895`. |

Before moving this file, re-check its hash. After moving it, verify the target has the same hash before editing its contents.

## Product-area and Feature mapping

Numeric prefixes are migration-only identifiers. Stable product-area paths use semantic slugs; ordering belongs in the Version manifest, not directory names.

| Legacy source | Stable product area | Initial Feature target | Target Version | Migration treatment |
|---|---|---|---|---|
| `v1.0.0/01-auth/` | `identity-and-account/` | `IAM-FEAT-001-authentication` | `v0.2.0` | Move PRD, user stories, and research into the Feature; derive canonical Feature docs without inventing behavior. |
| `v1.0.0/02-user-profile/` | `identity-and-account/` | `IAM-FEAT-002-user-profile` | `v0.2.0` | Merge into the same long-lived product area while retaining a separate Feature lifecycle. |
| `v1.0.0/03-user-settings/` | `identity-and-account/` | `IAM-FEAT-003-user-settings` | `v0.2.0` | Merge into the same long-lived product area while retaining a separate Feature lifecycle. |
| `_shared/04-rbac.md` | `access-control/` | `AC-FEAT-001-rbac` | `v0.1.0` | Promote from shared material because RBAC has its own owner, delivery status, and release lifecycle. |
| `v1.0.0/05-member-management/` | `member-management/` | `MEM-FEAT-001-member-management` | `v0.1.0` | Preserve current `In delivery` truth; Feature and validation migration remains a readiness blocker. |
| `v1.0.0/06-map-decision-support/` | `map-decision-support/` | `MAP-FEAT-001-map-decision-support` | `v0.2.0` | Move product evidence to the Feature; route current implementation material under Feature-local engineering where still valid. |
| `v1.0.0/07-resource-station/` | `resource-stations/` | `RS-FEAT-001-resource-stations` | `v0.1.0` | Normalize the plural product-area name; preserve product evidence and applicable implementation contracts. |
| `v1.0.0/08-ticket-management/` | `task-management/` | `TM-FEAT-001` through `TM-FEAT-006` | `v0.1.0` except guest privacy | Split the monolith by independently definable and releasable product changes; see the detailed routing below. |
| `v1.0.0/09-emergency-announcement/` | `emergency-announcements/` | `EA-FEAT-001-emergency-announcements` | `v0.2.0` | Normalize the plural product-area name and move product evidence into its Feature. |
| `v1.0.0/10-guest-ticket-privacy/` | `task-management/` | `TM-FEAT-003-guest-task-privacy` | `v0.2.0` | Merge into Task Management because it changes task visibility, not an independent product capability. |

### Task Management detailed routing

| Feature | Version | Source material and boundary |
|---|---|---|
| `TM-FEAT-001-custom-fields` | `v0.1.0` | Custom-field behavior, approved decisions D10-D16, wireframes, and the protected Flow. Open decisions remain only in `feature.md`; Flow contains sequence and Spec-rule references only. |
| `TM-FEAT-002-task-assignment` | `v0.1.0` | Self-claim versus coordinator assignment and acceptance. Remains Draft until the Owner resolves the assignment model. |
| `TM-FEAT-003-guest-task-privacy` | `v0.2.0` | Entire legacy `10-guest-ticket-privacy` scope plus any matching visibility requirement formerly embedded in 08. |
| `TM-FEAT-004-task-intake` | `v0.1.0` | Task/request creation and intake behavior from the 08 PRD and user stories. |
| `TM-FEAT-005-priority-and-sla` | `v0.1.0` | Priority and SLA behavior. Unresolved policy remains a blocking Open decision, not a Flow annotation. |
| `TM-FEAT-006-deduplication-and-building-groups` | `v0.1.0` | Duplicate handling and building/group semantics. Unresolved product rules remain blocking Open decisions. |

## Engineering artifact disposition

`engineering/` is optional and Feature-local. Only contracts that span multiple product areas may remain in `_shared/engineering/`. Archived material is evidence, not a canonical entry point or Version release evidence.

| Source | Disposition | Reason / target |
|---|---|---|
| `_shared/engineering/er-diagram.md` | Verify, then retain shared | Cross-area data model. Mark its verified scope and freshness; do not treat generated content as approved product behavior. |
| `_shared/engineering/graphql-api-design.md` | Verify, then move | Candidate for `map-decision-support/features/MAP-FEAT-001-map-decision-support/engineering/`; its GraphQL contract is not repository-wide governance. |
| `_shared/engineering/mapping-stations.csv` | Verify, then move | Candidate for `resource-stations/features/RS-FEAT-001-resource-stations/engineering/`. |
| `_shared/engineering/mapping-tasks.csv` | Archive | Known Task type/identity conflict; must not be cited as a current contract. |
| `_shared/engineering/rbac-permissions-design.md` | Archive | Known naming and permission-model conflict; preserve for reconciliation only. |
| `_shared/engineering/feature-dependency-analysis.md` | Archive | 2025 planning snapshot tied to obsolete numbered/version-owned structure. |
| `_shared/engineering/feature-integration-discussion.md` | Archive | 2025 discussion history, not an approved contract. |
| `_shared/engineering/specs-reading-guide.md` | Archive | Obsolete reading path that can direct agents to superseded canonical sources. |
| `05-member-management/engineering/**` | Archive pending reconciliation | Current delivery evidence may be extracted, but the existing package is not automatically a canonical product or engineering contract. |
| `06-map-decision-support/engineering/**` | Move only verified contracts; archive plans/research | Separate active implementation contracts from one-time plans, checklists, and exploratory research. |
| `07-resource-station/engineering/**` | Move only verified contracts; archive checklist/history | Feature-local contract if aligned with current behavior. |
| `08-ticket-management/engineering/request-management/**` | Archive as `legacy-unreconciled` | Conflicts with the current PRD/identity/status model. |
| `08-ticket-management/engineering/volunteer-dispatch/**` | Archive as `legacy-unreconciled` | Conflicts with unresolved assignment rules; may not constrain `TM-FEAT-002`. |
| `09-emergency-announcement/engineering/**` | Move only verified contract; archive checklist/history | Feature-local engineering evidence after alignment review. |

## Shared, template, and release-control material

| Source | Target treatment |
|---|---|
| `_shared/user-journey.md` | Retain only if it truly spans product areas; repair semantic product-area references. |
| `_shared/research/multitenancy-rls-breakglass-patterns.md` | Retain as non-authoritative cross-area research. |
| `_template/prd.md`, `_template/user-stories.md` | Replace with the approved product-area, Feature, Spec, Flow, Validation, and Version templates; archive only if historical provenance is useful. |
| `ACTIVE_VERSION` | Change from `v1.0.0` to `v0.1.0`; it sets the default Target Version only and never controls a Feature's physical location. |
| `v1.0.0/README.md` | Replace with `versions/v0.1.0.md` and `versions/v0.2.0.md`; do not migrate the version-owned directory model. |
| `v2.0.0/README.md`, `v2.0.0/backlog.md` | Archive as legacy roadmap material; re-home valid future ideas only through explicitly owned Features. |
| `_archive/**` | Preserve. Existing archive remains outside canonical validation and reading paths. |

## Coverage rule

Every file currently under `specs/v1.0.0/`, `specs/v2.0.0/`, and `specs/_shared/engineering/` is covered by a directory-level or exact-file rule above. No source file may be deleted during migration: it must be moved to a canonical semantic location or to `specs/_archive/` with its history and status intact.
