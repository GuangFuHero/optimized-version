# Product specifications

This directory is the canonical product-document system for Wanguard.

```text
specs/
  ACTIVE_VERSION
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
          engineering/      # Optional Feature-local implementation contract
  _shared/                  # Only genuinely cross-area material
  _template/
  _archive/                 # Historical and non-canonical material
```

## Version numbering

Use Semantic Versioning identifiers in the form `vMAJOR.MINOR.PATCH`.

- `v0.x.y` is an early trial line where the product contract may still evolve.
- Start with `v0.1.0`; do not create `v0.0.0`, because it communicates no usable release target.
- Increment MINOR for a planned set of new or materially changed user-visible capabilities.
- Increment PATCH for compatible fixes to an already released Version package.
- `v1.0.0` marks the first explicitly approved stable product contract; do not infer it from development progress.

The current default target is declared by [`ACTIVE_VERSION`](./ACTIVE_VERSION). Version manifests live under `versions/`; they never contain product-area directories or duplicate Feature requirements.

## Naming

- Product areas use durable semantic slugs such as `task-management`, never ordering prefixes such as `08-`.
- Feature folders use `<FEATURE-ID>-<semantic-slug>`, for example `TM-FEAT-001-custom-fields`.
- IDs are permanent. Rename a human-readable slug only when necessary; never recycle an ID.

## Reading and editing

Start at the relevant product-area `README.md`, then read its target Version and the owned Feature. Follow root [`AGENTS.md`](../AGENTS.md) and the repo-local product-spec skills before editing.

Open decisions live only in the owning `feature.md`. Research, wireframes, archived files, and engineering plans cannot override canonical product behavior.

After a change, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-specs.ps1
```
