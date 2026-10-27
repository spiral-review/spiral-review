# Implementation Plan Template

## Philosophy

Plans describe **what** to build and **why**, with enough **how** to communicate architectural intent. They are _not_ a pre-review of the code — the code review happens at PR time. Focus on strategic decisions, business logic, and maintainability concerns that a future reader (or your future self) would need to understand the intent behind the implementation.

## Naming Convention

Plans follow the pattern `NNN_short-name.md`, where `NNN` is a zero-padded sequential counter. Example: `001_finbuckle-multi-tenancy.md`. Plans are stored in `docs/plans/`.

## Sizing Guide

| Change Size | Examples                                                  | Sections Needed                   |
| ----------- | --------------------------------------------------------- | --------------------------------- |
| **Small**   | Single file change, config update, simple bug fix         | Minimum Viable Plan only          |
| **Medium**  | New feature, API endpoint, database migration             | Core + relevant optional sections |
| **Large**   | Multi-component feature, breaking changes, infrastructure | Full template                     |

### Minimum Viable Plan (Small Changes)

```markdown
# [Feature ID]: [Title]

## Overview

[What and why in 2-3 sentences]

## Approach

[High-level description of the change and any non-obvious choices]

## Acceptance Criteria

- [Specific, verifiable outcome]

Accept: `[gate command from AGENTS.md]`
```

---

## Full Template

Sections marked **[Required]** must always be included. Sections marked **[If Applicable]** should be included when relevant.

```markdown
# [Feature ID]: [Short Descriptive Title]

## Overview [Required]

[2-3 sentences describing what this change does and why it's needed. Include the business context.]

## References [If Applicable]

- [PRD: Feature Name](../prd/feature.md)
- [ADR-XXX: Relevant Architecture Decision](../adr/ADR-XXX_title.md)
- [Other relevant resources]

## Prerequisites [If Applicable]

| Prerequisite                | Status | Notes                  |
| --------------------------- | ------ | ---------------------- |
| [e.g., ADR-XXX accepted]    | Done   | Architectural decision |
| [e.g., Feature Y completed] | Done   | Pattern to follow      |

## Breaking Changes [Required for API/contract changes]

- [ ] **No breaking changes**
- [ ] **Breaking changes**:
  - [What is changing]
  - [Who is affected]
  - [Migration guidance]

## Scope [Required for Medium/Large]

### In Scope

- [Specific deliverable 1]
- [Specific deliverable 2]

### Out of Scope

- [Excluded item — reason or future ticket reference]

## Technical Approach [Required for Medium/Large]

[Describe the approach at an architectural level: which layers are involved, what patterns to follow, how components interact. Reference existing patterns by example (e.g., "Follows the same pattern as the existing Invoice entity"). Call out anything non-obvious or where multiple valid approaches exist.]

### Key Decisions [If Applicable]

| Decision         | Chosen Option | Rationale |
| ---------------- | ------------- | --------- |
| [Decision point] | [Choice]      | [Why]     |

### Risks & Trade-offs [If Applicable]

| Risk/Trade-off | Impact          | Mitigation    |
| -------------- | --------------- | ------------- |
| [Risk]         | Low/Medium/High | [How handled] |

## Implementation [Required]

[Describe the business logic, domain concepts, and architectural intent at a high level. List the files to create or modify so the structural footprint is clear, but don't describe their content — that's what the code review is for.]

### Files to Create [If Applicable]

| File Path             | Purpose            |
| --------------------- | ------------------ |
| `src/path/NewFile.cs` | [One-line purpose] |

### Files to Modify [If Applicable]

| File Path                  | Why               |
| -------------------------- | ----------------- |
| `src/path/ExistingFile.cs` | [One-line reason] |

### Files to Delete [If Applicable]

| File Path             | Reason            |
| --------------------- | ----------------- |
| `src/path/OldFile.cs` | [One-line reason] |

### API Changes [If Applicable]

[Describe new or changed endpoints/DTOs conceptually: what resources, what operations, what data shape.]

### Database Changes [If Applicable]

[Describe schema changes conceptually: new tables/columns, relationships, constraints. Reference ADR-004 conventions.]

### Configuration Changes [If Applicable]

[Describe what new configuration is needed and why.]

## Testing Strategy [Required]

[Describe what needs to be tested and at which layers. Focus on key scenarios and edge cases rather than exact test file paths.]

## Acceptance Criteria [Required]

- [Specific, measurable outcome 1]
- [Specific, measurable outcome 2]
- All tests passing

## Execution [Required for Medium/Large]

Gate: `[gate command from AGENTS.md]`

- [ ] C01 — [One testable outcome, e.g. "A stale save returns 409"]
      Accept: `[command that proves it, e.g. a filtered test run]`
- [ ] C02 — [Next outcome]
      Accept: `[command]`
```

---

## Execution Chunks

- A chunk is one testable outcome, small enough for one agent session, written as a sentence that is true when it's done.
- Each chunk has an `Accept:` command. A chunk is checked only when that command and the gate pass, with the real output in the commit or PR (see [Gate and Definition of Done](./README.md#gate-and-definition-of-done)).
- Checking a box is progress tracking, not a change to the plan. Adding, removing or rewording a chunk after approval is an amendment.

---

## Amendment Format

Implementation plans are **immutable after approval** (see [Documentation Update Policies](./README.md#documentation-update-policies)), except for checking off Execution chunks. When implementation deviates from the plan, append an **Amendments** section — do not modify the original content.

```markdown
---

## Amendments

### [YYYY-MM-DD]

**Deviation**: [Brief description of what changed from original plan]

**Reason**: [Why the change was necessary]

**Impact**: [Effect on scope, timeline, or other areas]
```

Multiple amendments are appended chronologically.

---

## Conditional Sections Reference

| Section               | Include When                                   |
| --------------------- | ---------------------------------------------- |
| References            | PRDs, ADRs, or external resources are relevant |
| Prerequisites         | Dependencies on prior work exist               |
| Breaking Changes      | Any API, contract, or schema changes           |
| Scope                 | Medium/large features needing boundaries       |
| Technical Approach    | Non-obvious implementation decisions           |
| Key Decisions         | Multiple valid approaches existed              |
| Risks & Trade-offs    | Known concerns need documentation              |
| API Changes           | New or modified endpoints/DTOs                 |
| Database Changes      | Schema or migration changes needed             |
| Configuration Changes | App settings or deployment config changes      |
| Execution             | Medium/large plans that agents carry out       |
