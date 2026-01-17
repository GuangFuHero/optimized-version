# Project Gemini Workflow

This document outlines the workflows and operating procedures for the Gemini agent to interact with the SpecKit framework in this repository. It is adapted from the project's original Claude-specific instructions.

## Core Workflows

### 1. Specify Feature (`/speckit.specify`)

**Description**: Create or update a feature specification from a natural language description.

**Execution Steps**:

1.  **Analyze User Input**: Treat the user's prompt as the feature description.
2.  **Determine Branch Name**:
    *   Generate a short name (2-4 words, e.g., "user-auth").
    *   Check for existing branches/specs to find the next available ID number (e.g., `004-user-auth`).
    *   Use `git fetch --all --prune` and `git branch` and `ls Spec/` to verify numbers.
3.  **Initialize**: Run the creation script:
    ```bash
    .specify/scripts/bash/create-new-feature.sh --json --number <N> --short-name "<name>" "<description>"
    ```
4.  **Draft Specification**:
    *   Load `.specify/templates/spec-template.md`.
    *   Fill in mandatory sections based on the description.
    *   **Crucial**: Make informed guesses for gaps; use max 3 `[NEEDS CLARIFICATION]` markers for critical ambiguities only.
    *   Define measurable, tech-agnostic Success Criteria.
5.  **Validate**:
    *   Create a temporary checklist based on `.specify/templates/checklist-template.md` (mentally or physically) to ensure quality (testable requirements, no implementation details).
    *   If clarifications are needed, present them to the user in a structured table.
6.  **Finalize**: Write the `spec.md` file.

### 2. Clarify Specification (`/speckit.clarify`)

**Description**: Interactive Q&A to resolve ambiguities in the spec.

**Execution Steps**:

1.  **Prerequisites**: Run `.specify/scripts/bash/check-prerequisites.sh --json --paths-only`.
2.  **Scan for Ambiguity**: Analyze `spec.md` for missing edge cases, vague terms, or undefined data models.
3.  **Interactive Loop**:
    *   Ask **one question at a time** (max 5 total).
    *   Provide recommended answers or options.
    *   Update `spec.md` immediately after each answer, recording the decision in a `## Clarifications` section and updating the relevant requirement text.
4.  **Completion**: When spec is clear, recommend proceeding to Planning.

### 3. Plan Implementation (`/speckit.plan`)

**Description**: Generate technical design artifacts (`plan.md`, `data-model.md`, `contracts/`).

**Execution Steps**:

1.  **Setup**: Run `.specify/scripts/bash/setup-plan.sh --json`.
2.  **Phase 0 (Research)**:
    *   Identify unknowns in the Spec.
    *   Perform necessary research (web search or codebase analysis).
    *   Write `research.md`.
3.  **Phase 1 (Design)**:
    *   Create `data-model.md` (Entities, Relationships).
    *   Define API Contracts in `contracts/` (OpenAPI/GraphQL).
    *   Update `plan.md` with the technical stack, architecture, and file structure.
4.  **Context Update**: Run `.specify/scripts/bash/update-agent-context.sh`.

### 4. Generate Tasks (`/speckit.tasks`)

**Description**: Convert the Plan and Spec into actionable, dependency-ordered tasks.

**Execution Steps**:

1.  **Load Context**: Read `plan.md`, `spec.md`, `data-model.md`.
2.  **Structure**:
    *   **Phase 1**: Setup.
    *   **Phase 2**: Foundation (Blocking tasks).
    *   **Phase 3+**: User Stories (Ordered by priority P1, P2...).
3.  **Task Format**: STRICTLY use the checklist format:
    ` - [ ] T001 [P] [US1] Description with src/file/path.ext`
    *   `[P]` for parallelizable tasks.
    *   `[US#]` for tasks linked to a specific user story.
4.  **Write**: Generate `tasks.md`.

### 5. Analyze Consistency (`/speckit.analyze`)

**Description**: Non-destructive check of `spec.md`, `plan.md`, and `tasks.md`.

**Execution Steps**:

1.  **Read-Only**: Do not modify files.
2.  **Checks**:
    *   **Duplication**: Redundant requirements.
    *   **Ambiguity**: Vague terms.
    *   **Coverage**: Requirements without tasks? Tasks without requirements?
    *   **Constitution**: Violations of project principles.
3.  **Report**: Output a structured markdown report with severity ratings (CRITICAL, HIGH, MEDIUM, LOW).

### 6. Create Checklists (`/speckit.checklist`)

**Description**: Generate "Unit Tests for Requirements" (not code tests).

**Execution Steps**:

1.  **Understand Goal**: E.g., "UX Checklist", "Security Checklist".
2.  **Clarify**: Ask questions if the scope is broad.
3.  **Generate**: Create `checklists/<domain>.md`.
    *   Items must check the *quality of the requirements* (e.g., "Is the error state defined?"), NOT the implementation.
4.  **Verify**: Ensure items ask "Is X specified?" rather than "Does X work?".

### 7. Implement (`/speckit.implement`)

**Description**: Execute the `tasks.md` file.

**Execution Steps**:

1.  **Prerequisites**: Verify `tasks.md` exists. Run `.specify/scripts/bash/check-prerequisites.sh`.
2.  **Checklist Gate**: Check `checklists/` status. If any fail, STOP and warn.
3.  **Ignore Files**: Verify/Create `.gitignore`, `.dockerignore`, etc., based on the stack.
4.  **Execution Loop**:
    *   Read `tasks.md`.
    *   Execute tasks phase-by-phase.
    *   **TDD**: Write tests before code where applicable.
    *   **Mark Complete**: Update `tasks.md` with `[x]` after success.
    *   **Verify**: Run project linters/tests after changes.

### 8. Constitution (`/speckit.constitution`)

**Description**: Update project governance rules.

**Execution Steps**:

1.  **Read**: `.specify/memory/constitution.md`.
2.  **Update**: Fill placeholders or amend principles based on user input.
3.  **Propagate**: Check if changes affect templates (`spec-template.md`, `plan-template.md`) and update them if necessary.
4.  **Version**: Increment Constitution version.

### 9. Tasks to Issues (`/speckit.taskstoissues`)

**Description**: Convert `tasks.md` items to GitHub Issues.

**Execution Steps**:

1.  **Prerequisites**: Ensure `gh` CLI is available and authenticated.
2.  **Read**: `tasks.md`.
3.  **Execute**:
    *   For each task, run:
        ```bash
        gh issue create --title "Task ID: Description" --body "Derived from tasks.md"
        ```
    *   (Note: Use `run_shell_command` for this).

---

## General Operating Principles

*   **Conventions**: Adhere to the project's `.editorconfig` and existing style.
*   **Safety**: Never delete or overwrite files without understanding the context. Use `read_file` first.
*   **Tools**: Use `run_shell_command` for scripts. Use `replace` or `write_file` for content.
*   **Context**: Always check `.specify/memory/constitution.md` for high-level rules.
