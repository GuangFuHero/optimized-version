# Product Spec Governance Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Wanguard product documentation from version-owned numbered folders to stable semantic product areas, Feature-local specifications, independent Version manifests, and enforceable Claude/agent guardrails.

**Architecture:** Product areas live permanently under `specs/product-areas/`; Features own changes, observable rules, flows, optional technical contracts, and validation. `specs/versions/` contains release manifests only. A PowerShell validator enforces paths, IDs, links, status gates, and document-role boundaries.

**Tech Stack:** Markdown, YAML front matter, PowerShell 7/Windows PowerShell-compatible validation, Git.

## Global Constraints

- Preserve the existing uncommitted move from `specs/v1.0.0/08-ticket-management/wireframe/flow.md` to `specs/v1.0.0/08-ticket-management/flow.md`; use the untracked root copy as the source when deriving `TM-FEAT-001-custom-fields/flow.md`.
- Do not modify Backend or Frontend implementation.
- Do not decide Task assignment behavior or the Custom Fields Q1–Q11 product questions.
- Do not mark any Feature Ready, Validated, or Released without Owner approval and immutable validation evidence.
- Use `v0.1.0` for Access Control, Member Management, Resource Stations, and Task Management.
- Use `v0.2.0` for Identity and Account, Map Decision Support, and Emergency Announcements.
- Product-area paths use semantic slugs without numeric prefixes.
- Open decisions live only in Feature `feature.md`; Flow may reference rules but may not create decisions, limits, or recommendations.
- Validation checkboxes remain unchecked because no immutable product build is being tested in this documentation migration.
- Preserve all historical source content either in the migrated canonical document or under `_archive/`/`research/`; do not silently discard it.
- Use `apply_patch` for file contents. Use `git mv` only for exact, reviewed path moves and stage only files owned by the current task.

---

### Task 1: Protect Existing Work and Establish the Migration Inventory

**Files:**
- Read: `specs/v1.0.0/**`
- Read: `specs/_shared/**`
- Read: `specs/v2.0.0/**`
- Create: `docs/product-spec-migration-inventory.md`

**Interfaces:**
- Consumes: approved governance design at `docs/superpowers/specs/2026-08-01-product-spec-governance-design.md`
- Produces: exact source-to-target map and SHA-256 evidence for the user's uncommitted `flow.md`

- [ ] **Step 1: Record the dirty-worktree boundary**

Run:

```powershell
git status --short
Get-FileHash -Algorithm SHA256 specs/v1.0.0/08-ticket-management/flow.md
```

Expected: only the existing deleted `wireframe/flow.md` and untracked root `flow.md` appear before migration work; record the hash in the inventory.

- [ ] **Step 2: Write the complete source-to-target map**

The inventory must contain this mapping:

```text
01-auth                  -> identity-and-account / IAM-FEAT-001-authentication
02-user-profile          -> identity-and-account / IAM-FEAT-002-user-profile
03-user-settings         -> identity-and-account / IAM-FEAT-003-user-settings
_shared/04-rbac.md       -> access-control / AC-FEAT-001-role-based-access
05-member-management     -> member-management / MEM-FEAT-001-member-management
06-map-decision-support  -> map-decision-support / MAP-FEAT-001-map-decision-support
07-resource-station      -> resource-stations / RS-FEAT-001-resource-stations
08-ticket-management     -> task-management / TM-FEAT-001...TM-FEAT-006
09-emergency-announcement -> emergency-announcements / EA-FEAT-001-emergency-announcements
10-guest-ticket-privacy  -> task-management / TM-FEAT-003-guest-ticket-privacy
```

Record these exact engineering dispositions:

```text
_shared/engineering/er-diagram.md                   -> keep shared; verify against migrations
_shared/engineering/graphql-api-design.md           -> MAP-FEAT-001/engineering/; verify against code
_shared/engineering/mapping-stations.csv             -> RS-FEAT-001/engineering/; verify against code
_shared/engineering/mapping-tasks.csv                -> _archive/legacy-engineering/task-management/
_shared/engineering/rbac-permissions-design.md       -> _archive/legacy-engineering/access-control/
_shared/engineering/feature-dependency-analysis.md   -> _archive/legacy-engineering/shared/
_shared/engineering/feature-integration-discussion.md -> _archive/legacy-engineering/shared/
_shared/engineering/specs-reading-guide.md           -> _archive/legacy-engineering/shared/
05-member-management/engineering/**                 -> _archive/legacy-engineering/member-management/
06-map-decision-support/engineering/**               -> _archive/legacy-engineering/map-decision-support/
07-resource-station/engineering/**                   -> _archive/legacy-engineering/resource-stations/
08-ticket-management/engineering/**                  -> _archive/legacy-engineering/task-management/
09-emergency-announcement/engineering/**             -> _archive/legacy-engineering/emergency-announcements/
```

- [ ] **Step 3: Verify the inventory covers every source file**

Run:

```powershell
rg --files specs/v1.0.0 specs/v2.0.0 specs/_shared | Sort-Object
```

Compare every output path against the inventory. Expected: no unmapped file.

- [ ] **Step 4: Commit only the inventory**

```powershell
git add docs/product-spec-migration-inventory.md
git commit -m "docs: inventory product spec migration"
```

---

### Task 2: Add Repository Guardrails and Canonical Templates

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `.agents/skills/manage-product-spec/SKILL.md`
- Create: `.agents/skills/derive-feature-spec/SKILL.md`
- Create: `specs/_template/product-area-readme.md`
- Create: `specs/_template/product-area-prd.md`
- Create: `specs/_template/feature.md`
- Create: `specs/_template/feature-spec.md`
- Create: `specs/_template/flow.md`
- Create: `specs/_template/validation.md`
- Create: `specs/_template/version.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: approved document-role and lifecycle rules
- Produces: mandatory reading order and copyable canonical file shapes used by later tasks

- [ ] **Step 1: Create root agent instructions**

`AGENTS.md` must state the minimal reading path:

```text
README.md -> AGENTS.md -> specs/README.md -> product-area README -> target Version -> owned Feature
```

It must define the source-of-truth table, status gates, conflict protocol, ownership boundaries, and the mandatory validator command:

```powershell
pwsh -File scripts/verify-specs.ps1
```

- [ ] **Step 2: Make Claude use the shared rules**

`CLAUDE.md` must contain only:

```markdown
Follow [AGENTS.md](./AGENTS.md).
```

Do not duplicate governance rules in `CLAUDE.md`.

- [ ] **Step 3: Adapt the two approved Qrio skills into repo-local skills**

Keep the behavior of `manage-product-spec` and `derive-feature-spec`, but replace Qrio paths and terminology with Wanguard paths:

```text
prd/...                    -> specs/product-areas/...
versions/<version-id>.md   -> specs/versions/<version-id>.md
web repository             -> Backend/ and Frontend/
```

Add the `v0.x.y` policy and semantic product-area naming rule. Do not copy Qrio-specific products or IDs.

- [ ] **Step 4: Create templates with exact required fields**

Every `feature.md` template must require:

```yaml
feature: TM-FEAT-001
title: Example
status: Draft
owner:
target_version: v0.1.0
```

The body must contain Outcome, Delta, In scope, Out of scope, Affects, Open decisions, Acceptance criteria, and Traceability. `flow.md` must explicitly prohibit Open decisions. `validation.md` must record immutable build, environment, executor, and date.

- [ ] **Step 5: Update the root README entry point**

Replace the one-line project description with a short human navigation section linking `DOCS.md`, `specs/README.md`, `AGENTS.md`, Backend, and Frontend. State that product definition lives in `specs/product-areas/` and release aggregation lives in `specs/versions/`.

- [ ] **Step 6: Verify guardrail discoverability**

Run:

```powershell
rg -n "specs/product-areas|specs/versions|verify-specs|Open decisions|Released" AGENTS.md README.md .agents/skills specs/_template
```

Expected: every governance concept is present in the canonical instruction or template; `CLAUDE.md` contains no duplicate rules.

- [ ] **Step 7: Commit the guardrails**

```powershell
git add AGENTS.md CLAUDE.md README.md .agents/skills specs/_template
git commit -m "docs: add product spec governance guardrails"
```

---

### Task 3: Build the Read-Only Specification Validator

**Files:**
- Create: `scripts/verify-specs.ps1`
- Create: `scripts/tests/verify-specs.tests.ps1`

**Interfaces:**
- Consumes: canonical paths, front matter fields, Feature/Version IDs, Markdown links
- Produces: process exit `0` with `VALIDATION_OK`, or exit `1` with one or more `[ERROR] <code> <path>: <message>` lines

- [ ] **Step 1: Write fixture-based failing tests**

The test script must create isolated temporary `specs/` fixtures and assert these error codes:

```text
VERSION_CONTENT       product folder found under versions/
TARGET_VERSION        Feature target Version missing or unresolved
STATUS_VALUE          illegal Feature status
VALIDATION_REQUIRED   Ready or later Feature lacks validation.md
FLOW_DECISION         flow.md contains Open decisions, 待討論, or Q<number>
RULE_UNRESOLVED       flow/validation references missing Spec rule
AC_UNCOVERED          AC missing Spec or validation coverage
BROKEN_LINK           relative Markdown link target missing
LEGACY_ENTRY          legacy-unreconciled path linked from canonical README/Version
NUMERIC_AREA          product-area folder starts with a numeric prefix
```

Each fixture must fail for exactly its intended error before the valid fixture is added.

- [ ] **Step 2: Run the tests and confirm the validator is absent**

Run:

```powershell
pwsh -File scripts/tests/verify-specs.tests.ps1
```

Expected: FAIL because `scripts/verify-specs.ps1` does not exist.

- [ ] **Step 3: Implement `verify-specs.ps1`**

Required CLI:

```powershell
pwsh -File scripts/verify-specs.ps1 [-Root <specs-path>] [-AllowMigrationBlockers]
```

Implementation rules:

- Resolve every target path before reading it.
- Never modify files.
- Parse YAML front matter by line boundaries; do not require external modules.
- Resolve relative Markdown links against the containing file.
- Resolve semantic product-area links by directory slug.
- Treat archived files as historical and exclude them from canonical-role checks.
- With `-AllowMigrationBlockers`, downgrade only explicitly registered legacy paths to `[BLOCKER]`; never downgrade errors in new files.

- [ ] **Step 4: Run fixture tests**

```powershell
pwsh -File scripts/tests/verify-specs.tests.ps1
```

Expected: all invalid fixtures produce their intended code and the valid fixture prints `VALIDATION_OK`.

- [ ] **Step 5: Run against the current pre-migration tree**

```powershell
pwsh -File scripts/verify-specs.ps1 -AllowMigrationBlockers
```

Expected: legacy layout appears only as registered blockers; the existing broken wireframe link is reported and retained as a blocker until Task 7.

- [ ] **Step 6: Commit validator and tests**

```powershell
git add scripts/verify-specs.ps1 scripts/tests/verify-specs.tests.ps1
git commit -m "test: validate product spec governance"
```

---

### Task 4: Create Version Manifests and the Product-Area Skeleton

**Files:**
- Create: `specs/versions/v0.1.0.md`
- Create: `specs/versions/v0.2.0.md`
- Create: `specs/product-areas/README.md`
- Modify: `specs/ACTIVE_VERSION`
- Modify: `specs/README.md`
- Modify: `DOCS.md`
- Archive after migration: `specs/v1.0.0/README.md`
- Archive after migration: `specs/v2.0.0/README.md`
- Archive after migration: `specs/v2.0.0/backlog.md`

**Interfaces:**
- Consumes: target Version scope and semantic product-area list
- Produces: canonical navigation and Version targets for every later Feature

- [ ] **Step 1: Set the active target Version**

Change `specs/ACTIVE_VERSION` to exactly:

```text
v0.1.0
```

- [ ] **Step 2: Create `v0.1.0.md`**

Use status `Planning`. Include exactly four scope rows:

```text
Access Control       In delivery
Member Management    In delivery
Resource Stations    Definition
Task Management      Definition
```

Record that no Feature is Released and no baseline anchor exists. The release gate remains unchecked.

- [ ] **Step 3: Create `v0.2.0.md`**

Use status `Planning`. Include Identity and Account, Map Decision Support, and Emergency Announcements as `Draft/Definition`; link deferred v0.1 Features only after a Feature explicitly targets v0.2.0.

- [ ] **Step 4: Rewrite `specs/README.md` and `DOCS.md`**

Remove the rules that a Version owns a Feature directory or that advancing a Version uses `git mv`. Document semantic product areas, Feature-local IDs, SemVer `v0.x.y`, archive boundaries, and the three-step human reading path.

- [ ] **Step 5: Add product-area index and old-name mapping**

`specs/product-areas/README.md` must list the seven semantic areas and an explicit historical mapping from 01–10 so old links can be diagnosed without remaining canonical.

- [ ] **Step 6: Verify the skeleton**

```powershell
pwsh -File scripts/verify-specs.ps1 -AllowMigrationBlockers
```

Expected: Version manifests and new navigation pass; old numbered folders remain registered blockers until Tasks 5–7.

- [ ] **Step 7: Commit Version and navigation changes**

```powershell
git add DOCS.md specs/ACTIVE_VERSION specs/README.md specs/versions specs/product-areas/README.md
git commit -m "docs: separate versions from product areas"
```

---

### Task 5: Migrate Identity, Access Control, and Member Management

**Files:**
- Create: `specs/product-areas/identity-and-account/README.md`
- Create: `specs/product-areas/identity-and-account/prd.md`
- Create: `specs/product-areas/identity-and-account/features/IAM-FEAT-001-authentication/feature.md`
- Create: `specs/product-areas/identity-and-account/features/IAM-FEAT-002-user-profile/feature.md`
- Create: `specs/product-areas/identity-and-account/features/IAM-FEAT-003-user-settings/feature.md`
- Move supporting research from: `specs/v1.0.0/01-auth/`, `02-user-profile/`, `03-user-settings/`
- Create: `specs/product-areas/access-control/README.md`
- Create: `specs/product-areas/access-control/prd.md`
- Create: `specs/product-areas/access-control/features/AC-FEAT-001-role-based-access/feature.md`
- Create: `specs/product-areas/access-control/features/AC-FEAT-001-role-based-access/spec.md`
- Create: `specs/product-areas/access-control/features/AC-FEAT-001-role-based-access/validation.md`
- Move source: `specs/_shared/04-rbac.md`
- Create: `specs/product-areas/member-management/README.md`
- Create: `specs/product-areas/member-management/prd.md`
- Create: `specs/product-areas/member-management/features/MEM-FEAT-001-member-management/feature.md`
- Create: `specs/product-areas/member-management/features/MEM-FEAT-001-member-management/validation.md`

**Interfaces:**
- Consumes: original product PRDs/stories and current implementation status supplied by the Owner
- Produces: v0.2 Identity drafts and v0.1 In-delivery Access/Member Features

- [ ] **Step 1: Build the Identity and Account product-area PRD**

Synthesize only durable purpose, shared actors, shared scope, and boundaries from 01–03. Move each original PRD's change-specific requirements into its Feature document. Preserve research under the owning Feature's `research/` directory.

- [ ] **Step 2: Create IAM Feature documents**

Assign all three `target_version: v0.2.0` and `status: Draft`. Preserve existing acceptance meaning but add stable `AC-01...` IDs. Do not create Spec/Flow/Validation until each Feature approaches Ready.

- [ ] **Step 3: Create Access Control as an In-delivery Feature**

Use `target_version: v0.1.0`, `status: In delivery`, and derive observable rules from the current RBAC document. Add an unchecked validation file and explicitly state that runtime validation has not been performed. Any implementation mismatch becomes a Feature Open decision or Known deviation, not a rewritten product rule.

- [ ] **Step 4: Create Member Management as an In-delivery Feature**

Use `target_version: v0.1.0`, `status: In delivery`. Keep the product-area PRD durable; put current delivery scope and unresolved behavior in `MEM-FEAT-001`. Add unchecked validation coverage for all current ACs.

- [ ] **Step 5: Archive unreconciled Member engineering material**

Move `specs/v1.0.0/05-member-management/engineering/` to `specs/_archive/legacy-engineering/member-management/` with a README stating it is historical and not a current product or technical contract.

- [ ] **Step 6: Verify these three areas**

```powershell
pwsh -File scripts/verify-specs.ps1 -AllowMigrationBlockers
```

Expected: no numeric-area, target-Version, status, or validation errors for Identity, Access Control, or Member Management.

- [ ] **Step 7: Commit the migration**

```powershell
git add specs/product-areas/identity-and-account specs/product-areas/access-control specs/product-areas/member-management specs/_archive/legacy-engineering/member-management specs/v1.0.0/01-auth specs/v1.0.0/02-user-profile specs/v1.0.0/03-user-settings specs/v1.0.0/05-member-management specs/_shared/04-rbac.md
git commit -m "docs: migrate identity access and members"
```

---

### Task 6: Migrate Map, Resource Stations, and Emergency Announcements

**Files:**
- Create: `specs/product-areas/map-decision-support/**`
- Create: `specs/product-areas/resource-stations/**`
- Create: `specs/product-areas/emergency-announcements/**`
- Move source from: `specs/v1.0.0/06-map-decision-support/`
- Move source from: `specs/v1.0.0/07-resource-station/`
- Move source from: `specs/v1.0.0/09-emergency-announcement/`
- Archive: product-specific legacy engineering documents under `specs/_archive/legacy-engineering/`

**Interfaces:**
- Consumes: original stories, PRDs, research, and technical documents
- Produces: `MAP-FEAT-001` and `EA-FEAT-001` targeting v0.2.0; `RS-FEAT-001` targeting v0.1.0

- [ ] **Step 1: Create each product-area README and durable PRD**

Use semantic names and keep only long-lived purpose, scope, actors, and trade-offs at product-area level.

- [ ] **Step 2: Create Feature documents**

Use:

```text
MAP-FEAT-001-map-decision-support  Draft       v0.2.0
RS-FEAT-001-resource-stations      Draft       v0.1.0
EA-FEAT-001-emergency-announcements Draft      v0.2.0
```

Preserve current AC meaning with stable IDs. Create Spec/Flow only where existing behavior would otherwise remain ambiguous. Do not create validation for Draft Features that are not approaching Ready.

- [ ] **Step 3: Route engineering material**

Move the old product-specific engineering directories to their exact archive targets from Task 1. Rebuild only `graphql-api-design.md` under `MAP-FEAT-001/engineering/` and `mapping-stations.csv` under `RS-FEAT-001/engineering/` after comparing them with current GraphQL code and models. Any mismatch is recorded in the owning Feature rather than silently normalized.

- [ ] **Step 4: Preserve shared contracts**

Keep only `er-diagram.md` under `_shared/engineering/`, and compare it against current Alembic migrations before retaining its current-contract label. Move the dated reading guide, integration discussion, and dependency analysis to `_archive/legacy-engineering/shared/`. Move `mapping-tasks.csv` to the Task Management legacy archive because its Ticket-level `task_type` contradicts the approved current model. Move `rbac-permissions-design.md` to the Access Control legacy archive because its permission names do not match the current code contract.

- [ ] **Step 5: Verify the three areas**

```powershell
pwsh -File scripts/verify-specs.ps1 -AllowMigrationBlockers
```

Expected: no errors in Map, Resource Stations, or Emergency Announcements; only Task Management/old Version blockers remain.

- [ ] **Step 6: Commit the migration**

```powershell
git add specs/product-areas/map-decision-support specs/product-areas/resource-stations specs/product-areas/emergency-announcements specs/_archive/legacy-engineering specs/_shared/engineering specs/v1.0.0/06-map-decision-support specs/v1.0.0/07-resource-station specs/v1.0.0/09-emergency-announcement
git commit -m "docs: migrate map resources and announcements"
```

---

### Task 7: Rebuild Task Management Without Mixed Document Roles

**Files:**
- Create: `specs/product-areas/task-management/README.md`
- Create: `specs/product-areas/task-management/prd.md`
- Create: `specs/product-areas/task-management/decisions.md`
- Create: `specs/product-areas/task-management/research/decision-history-2026-08-01.md`
- Create: `specs/product-areas/task-management/features/TM-FEAT-001-custom-fields/{feature.md,spec.md,flow.md,validation.md}`
- Move: current wireframes to `TM-FEAT-001-custom-fields/wireframe/`
- Create: `specs/product-areas/task-management/features/TM-FEAT-002-task-assignment/feature.md`
- Create: `specs/product-areas/task-management/features/TM-FEAT-003-guest-ticket-privacy/feature.md`
- Create: `specs/product-areas/task-management/features/TM-FEAT-004-intake-and-tracking/feature.md`
- Create: `specs/product-areas/task-management/features/TM-FEAT-005-priority-and-sla/feature.md`
- Create: `specs/product-areas/task-management/features/TM-FEAT-006-dedup-and-building-groups/feature.md`
- Archive: `specs/v1.0.0/08-ticket-management/engineering/**`
- Consume and remove after verified migration: `specs/v1.0.0/08-ticket-management/flow.md`
- Consume and remove after verified migration: deleted source record at `specs/v1.0.0/08-ticket-management/wireframe/flow.md`
- Consume: `specs/v1.0.0/10-guest-ticket-privacy/prd.md`

**Interfaces:**
- Consumes: current Task Management PRD/stories/decisions, the user's moved Flow, Guest Privacy PRD, research, and wireframes
- Produces: one product-area source, six bounded Draft Features, stable Custom Fields rules, and no duplicate Open decisions

- [ ] **Step 1: Preserve and clean decision history**

Move the complete D1–D16 grill log verbatim into `research/decision-history-2026-08-01.md`. Rewrite `decisions.md` to contain only binding product decisions D4, D7, and D9–D16 with: decision, reason, superseded behavior, effective Feature, and date. Tool installation and investigation steps remain history only.

- [ ] **Step 2: Rewrite the product-area README and PRD**

The README must state `Definition`, no released baseline, the minimal reading path, active Features, and the old engineering conflict. The PRD keeps only the durable Ticket -> Task model, actors, product-area scope, and boundaries; remove Feature-specific Open decisions and checklists.

- [ ] **Step 3: Create TM-FEAT-001 Custom Fields**

Use `status: Draft`, `target_version: v0.1.0`. Move Q1–Q11 into Feature Open decisions and identify which are blocking. Derive stable `TM-CF-101...` rules only from approved D10–D16; unresolved options must not become rules.

- [ ] **Step 4: Rewrite the user's Flow as a pure sequence**

Use the SHA-256-recorded untracked `flow.md` as source. Keep actor, trigger, sequence, and observable results. Remove implementation terms (`upsert`, raw keys, EAV), recommendations, and Q tables. Every behavior step must cite an existing `TM-CF-*` rule. Move the current wireframe files beside the Feature and update their README link to `../flow.md`.

- [ ] **Step 5: Create unchecked Custom Fields validation**

Map every Feature AC and Spec rule to a behavior-oriented checkbox. Include core path, permissions, data retention, error/offline, boundary, and one end-to-end path. Leave immutable build/executor/date blank and every box unchecked, with an explicit note that runtime validation has not run.

- [ ] **Step 6: Create the remaining bounded Draft Features**

Route the current PRD Open decisions exactly:

```text
D assignment identity/authority -> TM-FEAT-002
F guest field disclosure        -> TM-FEAT-003
A intake_source                 -> TM-FEAT-004
B SLA/escalation                -> TM-FEAT-005
C building anchor/grouping      -> TM-FEAT-006
```

`TM-FEAT-002` records self-accept vs coordinator assignment as blocking and targets `v0.1.0`. `TM-FEAT-003` absorbs the old Feature 10 scope, targets `v0.2.0`, and is explicitly excluded from v0.1.0. `TM-FEAT-004`, `TM-FEAT-005`, and `TM-FEAT-006` target `v0.1.0`; unresolved scope remains blocking and does not become approved v0.1 behavior merely because the target Version is assigned.

- [ ] **Step 7: Archive legacy engineering documents**

Move both old engineering specs and their self-checklists to `_archive/legacy-engineering/task-management/`. Add a README listing the specific conflicts: assignment authority, task categories, priority model, statuses, volunteer identity, and multi-assignee behavior.

- [ ] **Step 8: Verify no Task Management information is duplicated**

Run:

```powershell
rg -n "## 開放問題|## 待討論|\bQ[0-9]+\b" specs/product-areas/task-management
pwsh -File scripts/verify-specs.ps1 -AllowMigrationBlockers
Get-FileHash -Algorithm SHA256 specs/product-areas/task-management/features/TM-FEAT-001-custom-fields/flow.md
```

Expected: Open decisions appear only in Feature files; Flow contains no Q list; all old Flow scenarios are either represented by a rule/decision or recorded in the migration inventory as intentionally excluded because unresolved.

- [ ] **Step 9: Commit Task Management migration**

```powershell
git add specs/product-areas/task-management specs/_archive/legacy-engineering/task-management specs/v1.0.0/08-ticket-management specs/v1.0.0/10-guest-ticket-privacy docs/product-spec-migration-inventory.md
git commit -m "docs: rebuild task management specifications"
```

---

### Task 8: Retire the Old Version-Owned Tree and Repair All References

**Files:**
- Move to archive: remaining `specs/v1.0.0/README.md`
- Move to archive: `specs/v2.0.0/README.md`
- Move to archive: `specs/v2.0.0/backlog.md`
- Modify: all Markdown/CSV references found by `rg`
- Modify: `specs/_archive/README.md`
- Modify: `DOCS.md`

**Interfaces:**
- Consumes: completed product-area migration
- Produces: no canonical numbered/version-owned paths and a documented historical map

- [ ] **Step 1: Search for every old path and ID**

```powershell
rg -n "specs/v1\.0\.0|specs/v2\.0\.0|\[\[(0[1-9]|10)-|01-auth|02-user-profile|03-user-settings|04-rbac|05-member-management|06-map-decision-support|07-resource-station|08-ticket-management|09-emergency-announcement|10-guest-ticket-privacy" . -g '!specs/_archive/**' -g '!.claude/worktrees/**'
```

- [ ] **Step 2: Rewrite canonical references**

Use semantic product-area slugs and Feature IDs. Do not rewrite archived history; mark it historical in the archive README instead.

- [ ] **Step 3: Archive old Version navigation**

Move old v1/v2 READMEs and backlog into `_archive/version-owned-layout/`. Add a README stating their dates, superseding manifests, and prohibition on canonical use.

- [ ] **Step 4: Verify old canonical paths are absent**

Repeat the Step 1 search. Expected: zero matches outside archive, design/plan history, and explicit old-name mapping tables.

- [ ] **Step 5: Commit retirement and link repairs**

```powershell
git add DOCS.md specs
git commit -m "docs: retire version-owned spec layout"
```

---

### Task 9: Run the Full Governance Gate and Write the Claude Handoff

**Files:**
- Create: `docs/handoffs/2026-08-02-product-spec-governance.md`
- Modify if validation exposes defects: only the owning canonical files

**Interfaces:**
- Consumes: complete migrated tree and validator
- Produces: evidence-backed handoff and zero unregistered governance errors

- [ ] **Step 1: Run fixture tests**

```powershell
pwsh -File scripts/tests/verify-specs.tests.ps1
```

Expected: all validator tests pass.

- [ ] **Step 2: Run the strict validator**

```powershell
pwsh -File scripts/verify-specs.ps1
```

Expected: `VALIDATION_OK` with zero `[ERROR]` and zero unregistered `[BLOCKER]` entries.

- [ ] **Step 3: Run repository-level link and old-path scans**

```powershell
git diff --check
rg -n "specs/v1\.0\.0|specs/v2\.0\.0" . -g '!specs/_archive/**' -g '!docs/superpowers/**' -g '!.claude/worktrees/**'
git status --short
```

Expected: no diff-check errors, no active old paths, and no unrelated modifications. The original dirty Flow move is represented by the tracked migrated Feature flow and removal of both old locations.

- [ ] **Step 4: Write the Claude handoff**

The handoff must include:

```text
Objective
Canonical reading path
Files and directories migrated
Approved decisions
Blocking Open decisions
Version scope (v0.1.0 / v0.2.0)
Validation commands and exact results
Runtime validation not performed
Next Owner and next decision
```

- [ ] **Step 5: Re-run the strict validator after the handoff**

```powershell
pwsh -File scripts/verify-specs.ps1
git diff --check
```

Expected: `VALIDATION_OK` and no whitespace errors.

- [ ] **Step 6: Commit the handoff**

```powershell
git add docs/handoffs/2026-08-02-product-spec-governance.md
git commit -m "docs: hand off product spec governance"
```
