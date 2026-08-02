# Product documentation rules

These rules apply to every agent editing this repository. Product documents use one canonical source per kind of information; do not create side notes that contradict or "clarify" a canonical file.

## Required reading path

Read only what the task needs, in this order:

1. Root `README.md` and this file.
2. `Spec/README.md`.
3. The owned product area's `README.md`.
4. The Feature's `Target Version` manifest under `Spec/versions/`.
5. The owned Feature's `feature.md`, then its `spec.md`, `flow.md`, or `validation.md` only as needed.

All paths in this file are relative to the repository root.

Do not scan or modify unrelated product areas. Archive and research files are evidence, not current product behavior.

## Scope boundary

`Spec/` defines what the product must do for its users. It is not a place for implementation.

- Never edit, move, rename, or delete anything under `Backend/`, `Frontend/`, or `System_Design/`. Those folders belong to other teams. If product work appears to require a change there, describe it and hand it to the Owner.
- Backend engineering specifications stay in `Backend/Spec/`. Do not copy or relocate them here.
- Keep schemas, API contracts, migrations, library choices, and code out of `Spec/`. Link to the engineering document by path instead of duplicating it; a duplicate will drift.
- A Feature-local `engineering/` folder records only an already-agreed contract the Feature depends on. It is a reference, never a place to design implementation.

## Local skills

The skills under `.agents/skills/` are local tooling and are not committed. When present, read `manage-product-spec/SKILL.md` before any Feature, Version, decision, Spec, Flow, Validation, or product-area change, and `derive-feature-spec/SKILL.md` before writing observable behavior rules. When absent, this file is the complete rule set.

## Stable structure

- Product areas live at `Spec/product-areas/<semantic-slug>/` and never move for a Version.
- Features live at `features/<FEATURE-ID>-<semantic-slug>/` inside one product area.
- Versions live at `Spec/versions/<version-id>.md` and are manifests, not folders for product documents.
- Do not add numeric ordering prefixes such as `01-` to product-area names.
- `engineering/` is optional and Feature-local. Keep only genuinely cross-area contracts under `Spec/_shared/engineering/`.
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
| Real situations an approved decision came from | Feature `scenarios.md` |
| Approved decisions and rationale | Product-area `decisions.md` |
| Current released behavior | Product-area baseline `spec.md` |
| Version outcome, inclusion, exclusions, and release gate | `versions/<version-id>.md` |

Open decisions exist only in the owning Feature's `feature.md`. A Flow may reference Spec rule IDs but may not create requirements, limits, decisions, recommendations, data models, or implementation instructions.

## Scenarios

A Feature may keep a `scenarios.md` holding the real situations its decisions came from. It is supporting material, never a source of behavior: where a scenario and `spec.md` disagree, the scenario is the one that is wrong. Use `Spec/_template/scenarios.md`, which is the only permitted shape.

- Scenarios are written in Traditional Chinese and must be understandable to a reader who has opened no other file in the folder. Spell terms out — 超級管理員, not 超管 — and call product concepts by the names the documents use, never internal shorthand.
- Every scenario carries one type of `陽光`, `異常`, `邊界`, `衝突`, or `變遷`, and one frequency of `高頻` or `低頻`. Field conditions such as rain, gloves, or lost signal are background written into the scenario, not a type.
- Keep the four fixed lines: 誰, 情境, 不這樣做會怎樣, 結論. The 結論 states the resulting rule in one plain sentence, then cites the decisions, acceptance criteria, and Spec rules it produced.
- `S-NN` is a citation handle only. Keep it off the heading, on the tag line and in the index table.
- Include at least one `陽光` scenario, so a reader meets the normal path before the exceptions.

## Status authority

Allowed Feature statuses are `Draft`, `Ready`, `In delivery`, `Validated`, `Released`, and `Superseded`.

Do not promote a Feature to `Ready`, `Validated`, or `Released` without explicit Owner approval and matching evidence. `Validated` and `Released` require all applicable checks in `validation.md` to pass against one immutable build or commit. When no runtime validation was performed, leave checkboxes unchecked.

A Released Feature immediately updates the product-area baseline `spec.md`. A formal Version later aggregates Released Features; it does not delay or determine their user-visible release state.

## Conflicts and scope

When product and engineering documents disagree, list the conflict, affected behavior, options, and recommendation, then wait for the Owner. Do not choose an unresolved product direction or let a legacy engineering document override approved behavior. Do not use `legacy-unreconciled` material as a canonical entry point or release evidence.

## Verification and handoff

After any product-spec change, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Spec/tools/verify-specs.ps1
```

PowerShell 7 users may substitute `pwsh` for `powershell`. During the migration, `-AllowMigrationBlockers` may be used only when every remaining exception is explicitly registered; new violations are never allowed.

Handoffs must state the objective, changed files, decisions recorded, unresolved Open decisions, verification performed and result, and next owner.
