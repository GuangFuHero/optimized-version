---
name: derive-feature-spec
description: Use when deciding whether a Wanguard Feature needs a Spec or Flow, or when deriving observable rules and traceability from an approved Feature without inventing behavior.
---

# Derive Feature Spec

Read `AGENTS.md`, `.agents/skills/manage-product-spec/SKILL.md`, the product-area `README.md`, target Version, owned Feature, applicable decisions, and released baseline. Do not infer answers to Open decisions.

## Decide what to create

Create `spec.md` only when the Feature changes behavior that acceptance criteria alone cannot describe unambiguously, including permissions, state transitions, errors, fallback, concurrency, retention, or cross-system contracts. Create `flow.md` only when cross-role, cross-screen, cross-system, or state order materially aids understanding.

Never create a Spec or Flow as an empty placeholder. A Draft may have neither.

## Derive rules

Use `specs/_template/feature-spec.md`. State what the Feature adds or changes, which released rule it replaces if any, and what remains unchanged. Assign stable rule IDs using the product area and Feature vocabulary, for example `TM-CF-101`.

Every rule must describe an actor or system, precondition, trigger, observable result, and constraint where relevant. Cover normal behavior and applicable empty, error, timeout, retry, permission, data retention, destructive action, offline, concurrency, and fallback behavior.

Do not include UI implementation details, function names, storage designs, API internals, or recommendations unless an approved product rule requires an observable contract.

## Keep traceability closed

- Every acceptance criterion maps to one or more Spec rules when a Spec exists.
- Every Spec rule maps back to approved Feature scope or a recorded decision.
- Flow references existing Spec rule IDs and introduces no new rule or Open decision.
- Validation covers every acceptance criterion and every applicable Spec rule.

If any link is missing or a blocking Open decision remains, keep the Feature below `Ready` and report the exact blocker.

## Baseline semantics

Before the first release, a product area may have no baseline `spec.md`; record that as readiness information rather than inventing one. On release, merge the effective Feature rules into the baseline, removing superseded behavior. Version manifests reference the released Feature and immutable evidence; they do not duplicate its rules.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-specs.ps1` before handoff.
