# Product specifications

This directory is the canonical product-document system for Wanguard. Everything needed to read, change, and verify product documentation lives here; the repository root holds only the application and its license.

```text
Spec/
  AGENTS.md                 # Rules every agent and contributor follows first
  CLAUDE.md                 # Pointer to AGENTS.md
  ACTIVE_VERSION            # Default Target Version for new Features
  versions/                 # Release manifests only
  product-areas/            # Stable semantic capability paths
    <area>/
      README.md             # Entry point, status, Features, conflicts
      prd.md                # Durable purpose and boundaries
      spec.md               # Released baseline; absent before first release
      decisions.md          # Approved binding decisions
      features/
        <FEATURE-ID>-<slug>/
          feature.md
          spec.md           # Only when behavioral ambiguity requires it
          flow.md           # Only when sequence requires it
          validation.md     # Required before Ready
          scenarios.md      # Optional: the situations a decision came from
          engineering/      # Optional Feature-local implementation contract
  _shared/                  # Only genuinely cross-area material
  _template/                # Document templates
  _process/                 # Handoffs, migration plans, design records
  _archive/                 # Historical and non-canonical material
  tools/                    # Specification verification script and its tests
```

## Version numbering

Use Semantic Versioning identifiers in the form `vMAJOR.MINOR.PATCH`.

- `v0.x.y` is an early trial line where the product contract may still evolve.
- Start with `v0.1.0`; do not create `v0.0.0`, because it communicates no usable release target.
- Increment MINOR for a planned set of new or materially changed user-visible capabilities.
- Increment PATCH for compatible fixes to an already released Version package.
- `v1.0.0` marks the first explicitly approved stable product contract; do not infer it from development progress.

The current default target is declared by [`ACTIVE_VERSION`](./ACTIVE_VERSION). Version manifests live under `versions/`; they never contain product-area directories or duplicate Feature requirements.

Current planned manifests: [`v0.1.0`](./versions/v0.1.0.md) covers Access Control, Member Management, Resource Stations, Task Management, and map Zone drawing; [`v0.2.0`](./versions/v0.2.0.md) plans Identity and Account, the remaining Map Decision Support capabilities, and Emergency Announcements. Product-area navigation and historical-name diagnosis live in [`product-areas/README.md`](./product-areas/README.md).

## Release semantics

- A Feature is defined, validated, and released on its own. Once it is live for users it is `Released`, and the product-area baseline `spec.md` is updated immediately.
- A Version later aggregates a batch of Released Features. It does not contain their folders and does not decide whether they are live.
- `ACTIVE_VERSION` only supplies the default Target Version for new Features; it never changes physical paths or status.

## Naming

- Product areas use durable semantic slugs such as `task-management`, never ordering prefixes such as `08-`.
- Feature folders use `<FEATURE-ID>-<semantic-slug>`, for example `TM-FEAT-001-custom-fields`.
- IDs are permanent. Rename a human-readable slug only when necessary; never recycle an ID.

Historical names are mapped in [`product-areas/README.md`](./product-areas/README.md). The former Version-owned layout and the unreconciled engineering documents were moved to `_archive/` and are no longer reading entry points.

## Engineering boundary

This directory is read-only with respect to engineering. Nothing here may be edited to describe how something is built.

- [`Backend/`](../Backend/), [`Frontend/`](../Frontend/), and [`System_Design/`](../System_Design/) are owned by other teams and are never modified from product work.
- Backend engineering specifications live in [`Backend/Spec/`](../Backend/Spec/) and stay there.
- `_shared/engineering/` holds pointers to cross-area engineering documents, not copies of them. See [`_shared/engineering/er-diagram.md`](./_shared/engineering/er-diagram.md).
- Feature-local `engineering/` records an already-agreed contract a Feature depends on. It never designs implementation.
- When an engineering document and product behavior disagree, list the difference and its impact and wait for the Owner. Never let an engineering document overwrite an approved product specification.

## Reading and editing

Start at the relevant product-area `README.md`, then read its target Version and the owned Feature. Follow [`AGENTS.md`](./AGENTS.md) and the repo-local product-spec skills before editing.

```text
product-area README -> target Version -> owned Feature
```

Open decisions live only in the owning `feature.md`. Research, wireframes, scenarios, archived files, and engineering plans cannot override canonical product behavior.

A Feature may keep a `scenarios.md` recording the real situations its decisions came from, so design, engineering, and field training can see why a rule takes the shape it does. It is supporting material, never a source of behavior: each scenario cites the decisions and acceptance criteria it produced, and a scenario that disagrees with `spec.md` is the one that is wrong.

After a change, run this from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Spec/tools/verify-specs.ps1
```

Passing the document checks does not mean runtime validation has been performed.
