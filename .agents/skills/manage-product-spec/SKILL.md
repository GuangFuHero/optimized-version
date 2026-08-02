---
name: manage-product-spec
description: Use when creating, changing, reviewing, or reconciling Wanguard product areas, Features, Versions, decisions, Specs, Flows, Validation, or related product documentation.
---

# Manage Product Specs

Follow `AGENTS.md`; this skill supplies the operating sequence.

## Start small

Read the product-area `README.md`, the Feature's target Version, and the owned `feature.md`. Load the baseline, decisions, Spec, Flow, Validation, engineering contract, research, or implementation only when the task requires it. Inspect the working tree and preserve unrelated changes.

## Route information once

- Put status, entry points, active Features, baseline readiness, and conflicts in the product-area `README.md`.
- Put one change's outcome, delta, scope, Open decisions, and acceptance criteria in `feature.md`.
- Put observable behavior in Feature `spec.md`; use stable rule IDs.
- Put sequence only in `flow.md`, referencing existing rule IDs.
- Put checks and actual results in Feature `validation.md`.
- Put binding decisions and rationale in product-area `decisions.md`.
- Put released current behavior in product-area baseline `spec.md`.
- Put release aggregation and evidence in the Version manifest.

Do not create empty placeholders, Feature-level README files, changelogs, or parallel correction notes.

## Create or update a Feature

Use `specs/_template/feature.md`. Each Feature has exactly one `Target Version` and the required frontmatter fields `feature`, `title`, `status`, `owner`, and `target_version`.

Keep unresolved questions under `Open decisions` and name what each blocks. Acceptance criteria must be observable and use stable IDs. Cover core, error, boundary, permission/data, and fallback behavior when relevant. Create `validation.md` before `Ready`. Create a Spec only when acceptance criteria alone leave behavioral ambiguity; create a Flow only when order across roles, screens, systems, or states needs explanation.

## Resolve a decision

When the Owner decides:

1. Update the Feature so the decision reads as normal product behavior.
2. Update affected acceptance criteria, Spec rules, Flow references, validation, and contracts.
3. Record the decision, reason, effective Feature, and superseded direction in product-area `decisions.md`.
4. Remove the resolved Open decision; write `None.` if none remain.
5. Re-evaluate status but never promote it without explicit Owner approval.

## Validate and release

Every validation checkbox names the acceptance criterion and applicable Spec rule IDs it covers. Record one immutable build or commit, environment, executor, and date. Unchecked means not yet run or not passing. If the Feature, Spec, Flow, tested implementation, or build changes, clear affected checks.

After explicit release approval and successful validation, merge the Feature's behavior into the product-area baseline `spec.md`; keep the Feature as history. Update the Version manifest with immutable evidence when formally aggregating the release.

## Finish

Run `pwsh -File scripts/verify-specs.ps1`. Report changed canonical files, decisions, remaining Open decisions, validation actually performed, and next owner. Never claim runtime validation from document checks alone.
