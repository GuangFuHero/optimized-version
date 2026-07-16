# RBAC — Announcements & Briefings Adaptation Decisions

> Feature branch: `feature/backend-annoucement-rbac`
> Scope: adapting the **announcements** and **briefings** GraphQL modules to the RBAC v1
> capability engine merged from `popo/rbac-v1`.
>
> **Why a separate file / numbering (`ADR-AB-NN`)**: the base branch `popo/rbac-v1` (#24) goes
> up to ADR-054 in [`RBAC_V1_DECISIONS.md`](./RBAC_V1_DECISIONS.md), but the sibling stack
> #26/#27 already consumed ADR-055…061 there. Continuing the global sequence would collide at
> integration, so this feature's decisions live here with a feature-scoped `ADR-AB-NN` numbering
> and cross-reference the global log where relevant.
>
> Design spec: [`docs/superpowers/specs/2026-07-16-announcements-briefings-rbac-adaptation-design.md`](./docs/superpowers/specs/2026-07-16-announcements-briefings-rbac-adaptation-design.md)

---

## ADR-AB-01 — `briefing.*` as an independent capability module

**Context.** The RBAC v1 catalog (`app/core/permissions.py`) reserved `announcement.*` but had
no key for briefings. Two options: (a) reuse `pre_departure.*` (行前通知 / Pre-Departure Notice),
or (b) add a dedicated `briefing.*`. The briefing feature is a two-tier system
(`briefing_templates` + `briefings`) spanning three deployment-lifecycle phases
(`state ∈ {briefing, in_field, debrief}` = 行前/現場/回程) plus reusable templates and tag
classification — it is structurally and semantically distinct from announcements (a flat,
orderable site-notice list, `announcement.*`) and broader than `pre_departure` (only the 行前
notice, i.e. the `state=briefing` phase).

**Decision.** Add a dedicated `briefing.*` capability module to `Perm`:
`briefing.view`, `briefing.create`, `briefing.edit`, `briefing.delete`.
`briefing.view` is **not** added to `PUBLIC_PERMS` — briefings are internal deployment material
and require an authenticated actor (unlike `announcement.view`, which is public).

**Consequences.**
- Briefings get their own permission domain; role grants can be tuned independently of
  announcements and pre_departure.
- `pre_departure.*` remains reserved for a future, distinct "行前通知推播" feature; no coupling.
- The keys are seed-registered by `scripts/seed_rbac.py` (it loops the whole `Perm` enum), so no
  manual DB insert is needed; they become enforceable once the resolvers/services check them.

---

## ADR-AB-02 — Keep announcements/briefings on GraphQL; extract a service layer

**Context.** Both modules are simple admin CRUD with no nested resolvers, no relation
expansion, and no frontend consumer bound to the schema yet — GraphQL buys them little, and
the platform already serves admin surfaces (`admin.py`, `users.py`) over REST. The task's goal,
however, is RBAC adaptation, not an API-transport migration.

**Decision.** Keep the GraphQL transport and, per rbac-v1's ADR-013/014, move authz +
validation + business logic into `app/services/announcement.py` and `app/services/briefing.py`.
Resolvers become thin: `require_authenticated(info)` → call the service → map to a GraphQL type.
Reads keep their gating in the resolver via `check_permission(info, Perm.X)` (the rbac-v1 read
idiom that layers Guest handling and returns a `Scope`), because announcements have a public
read path.

**Consequences.**
- The service layer is entrypoint-agnostic, so a later REST migration is a thin swap of the top
  adapter, not a logic rewrite.
- Resolvers no longer own authorization; the single source of truth is the service.

---

## ADR-AB-03 — Announcement/briefing scope is checkpoint-1-only

**Context.** rbac-v1 has two checkpoints: CP1 = capability (`require_scope`), CP2 = object scope
(`in_scope`, for `own`/`zone`/`team`). Announcements and briefings are global site/deployment
content with no owner-scoped or geographic dimension.

**Decision.** Every announcement/briefing service function calls `require_scope(actor, Perm.X, db)`
**without** a `resource=` argument — checkpoint 1 only, same as `services/config.py`. No masking,
no `in_scope` object check.

**Consequences.**
- Grants for these modules only ever use scope `all` (or none); `own`/`zone`/`team` are
  meaningless here and are never assigned.
- Simpler than the geo/ticket services and cannot leak cross-boundary data (there are no
  boundaries in this domain).

---

## ADR-AB-05 — Alembic double-head merge revision

**Context.** Merging `popo/rbac-v1` into the announcements/briefings branch left two Alembic
heads, both descending from `71bd05e07df3` (create_audit_system): `c3f0a1b2d4e6` (briefings) and
`a3f8d1c9e2b5` (rbac tax_id). Alembic refuses to run with multiple heads.

**Decision.** Add an empty merge revision `2e0a52d2d1e0` with
`down_revision = ('a3f8d1c9e2b5', 'c3f0a1b2d4e6')`, no schema ops. The two feature histories are
disjoint (no revision-id collision), so a plain merge revision linearizes them.

**Consequences.**
- `alembic upgrade head` walks the full chain to the single head `2e0a52d2d1e0` (validated
  offline via `alembic upgrade head --sql`).
- No data migration is needed; both branches' tables already exist independently.
