# Product documentation rules

These rules apply to every agent editing this repository. Product documents use one canonical source per kind of information; do not create side notes that contradict or "clarify" a canonical file.

## Required reading path

Read only what the task needs, in this order:

1. Root `README.md` and this file.
2. `specs/README.md`.
3. The owned product area's `README.md`.
4. The Feature's `Target Version` manifest under `specs/versions/`.
5. The owned Feature's `feature.md`, then its `spec.md`, `flow.md`, or `validation.md` only as needed.

Do not scan or modify unrelated product areas. Archive and research files are evidence, not current product behavior.

## Required local skills

- For any Feature, Version, decision, Spec, Flow, Validation, or product-area change, read `.agents/skills/manage-product-spec/SKILL.md` first.
- When creating or changing observable behavior rules, also read `.agents/skills/derive-feature-spec/SKILL.md`.

## Stable structure

- Product areas live at `specs/product-areas/<semantic-slug>/` and never move for a Version.
- Features live at `features/<FEATURE-ID>-<semantic-slug>/` inside one product area.
- Versions live at `specs/versions/<version-id>.md` and are manifests, not folders for product documents.
- Do not add numeric ordering prefixes such as `01-` to product-area names.
- `engineering/` is optional and Feature-local. Keep only genuinely cross-area contracts under `specs/_shared/engineering/`.
- `ACTIVE_VERSION` supplies a default Target Version for new Features; it does not change physical paths or status.

## Canonical ownership

| Information | Canonical file |
|---|---|
| Product-area status, reading path, active Features, known conflicts | Product-area `README.md` |
| Durable product-area purpose and boundaries | Product-area `prd.md` |
| One change, scope, Open decisions, acceptance criteria | Feature `feature.md` |
| Observable behavior rules | Feature `spec.md` |
| Cross-role, cross-screen, or state sequence | Feature `flow.md` |
| Checks and immutable validation evidence | Feature `validation.md` |
| Approved decisions and rationale | Product-area `decisions.md` |
| Current released behavior | Product-area baseline `spec.md` |
| Version outcome, inclusion, exclusions, and release gate | `versions/<version-id>.md` |

Open decisions exist only in the owning Feature's `feature.md`. A Flow may reference Spec rule IDs but may not create requirements, limits, decisions, recommendations, data models, or implementation instructions.

## Status authority

Allowed Feature statuses are `Draft`, `Ready`, `In delivery`, `Validated`, `Released`, and `Superseded`.

Do not promote a Feature to `Ready`, `Validated`, or `Released` without explicit Owner approval and matching evidence. `Validated` and `Released` require all applicable checks in `validation.md` to pass against one immutable build or commit. When no runtime validation was performed, leave checkboxes unchecked.

A Released Feature immediately updates the product-area baseline `spec.md`. A formal Version later aggregates Released Features; it does not delay or determine their user-visible release state.

## Conflicts and scope

When product and engineering documents disagree, list the conflict, affected behavior, options, and recommendation, then wait for the Owner. Do not choose an unresolved product direction or let a legacy engineering document override approved behavior. Do not use `legacy-unreconciled` material as a canonical entry point or release evidence.

## Verification and handoff

After any product-spec change, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-specs.ps1
```

PowerShell 7 users may substitute `pwsh` for `powershell`. During the migration, `-AllowMigrationBlockers` may be used only when every remaining exception is explicitly registered; new violations are never allowed.

Handoffs must state the objective, changed files, decisions recorded, unresolved Open decisions, verification performed and result, and next owner.
