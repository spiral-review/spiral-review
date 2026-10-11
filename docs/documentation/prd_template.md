# PRD Template

## Philosophy

PRDs define **what** to build and **why**, grounded in user value and business context. They are product documents, not technical specs — leave architecture to implementation plans and ADRs. Focus on the problem, the scope boundaries, the data contract, and testable acceptance criteria.

## Naming Convention

PRDs follow the pattern `NNN_short-name.md`, where `NNN` is a zero-padded sequential counter. Example: `001_customer-management.md`. PRDs are stored in `docs/prd/`.

## Sizing Guide

| Change Size | Examples | Sections Needed |
|-------------|----------|-----------------|
| **Small** | Minor entity, config flag, simple feature | Minimum Viable PRD only |
| **Medium** | Full CRUD entity, new workflow | Core + relevant optional sections |
| **Large** | Multi-entity feature, compliance-heavy | Full template |

### Minimum Viable PRD (Small Features)

```markdown
# PRD-NNN: [Title]

**Status**: Draft | Approved
**Date**: YYYY-MM-DD
**Author**: Product Lead

## Problem
[What user problem are we solving and why now, in 2-3 sentences]

## Goals
- [Goal 1]

## Non-Goals
- [Excluded item]

## Data Model
[Fields table or brief description]

## Acceptance Criteria
- **AC1**: Given [context], when [action], then [outcome]
```

---

## Full Template

Sections marked **[Required]** must always be included. Sections marked **[If Applicable]** should be included when relevant.

```markdown
# PRD-NNN: [Short Descriptive Title]

**Status**: Draft | Approved
**Date**: YYYY-MM-DD
**Author**: Product Lead

## Problem [Required]

[What user problem are we solving? Why now? 2-4 sentences grounding the feature
in user value. Mention the user persona if helpful — e.g., "As an Italian SMB owner
issuing electronic invoices..."]

## Goals [Required]

1. [Business/user outcome, not implementation detail]
2. [Keep to 3-5 goals max]

## Non-Goals [Required]

- [Excluded item] — [one-line rationale why it's excluded or when it moves in scope]

## References [If Applicable]

- [PRD-XXX: Related Feature](./NNN_related.md)
- [ADR-XXX: Relevant Decision](../adr/ADR-XXX_title.md)
- [External regulation, standard, or spec]

## Domain Concepts [If Applicable]

[Explain domain-specific terms, types, or rules the reader needs to understand the
data model and validation. E.g., customer types, VAT nature codes, document statuses.
Use tables for enums/lookup values.]

## Data Model [Required]

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `Id` | int | auto | PK |
| ... | | | |

[Include all fields referenced in validation rules and acceptance criteria.
Cross-check: every field mentioned in business logic must appear here.]

## Validation Rules [Required]

| Rule | Error Code |
|------|-----------|
| [Human-readable rule] | `ENTITY_FIELD_REASON` |

[Use consistent error code format: `ENTITY_FIELD_REASON` (e.g., `CUSTOMER_NAME_REQUIRED`).]

## API Endpoints [Required]

[Define REST resources, methods, request/response shapes, query parameters.
Include at least one request body example for create/update endpoints.]

`/api/app/v1/[resource]`

| Method | Path | Notes |
|--------|------|-------|
| POST | /resource | 201 + Location |
| GET | /resource/{id} | 200 or 404 |
| PUT | /resource/{id} | 204 or 404 |
| DELETE | /resource/{id} | Soft delete. 204 or 404 |
| GET | /resource | List with filters |

## Seed Data [If Applicable]

[Pre-populated data for new tenants. Include a table with values.]

## Edge Cases [If Applicable]

[Behavioral edge cases not covered by validation rules. E.g., "What happens when
deleting an entity referenced by another entity?" or "What if the user changes X
after Y is already finalized?"]

## Acceptance Criteria [Required]

Use Given/When/Then format consistently:

- **AC1**: Given [context], when [action], then [expected outcome]
- **AC2**: Given [context], when [action], then [expected outcome]

[Cover: happy path, validation failures, edge cases, tenant isolation, soft delete behavior.]

## UI Notes [If Applicable]

[Brief notes on expected UI behavior, or a pointer to the UX design doc in
`docs/design/`. E.g., "Standard CRUD list+detail, no special UX needed" or
"See docs/design/NNN_feature.md for flows."]
```

---

## Amendment Format

PRDs are **immutable after approval** (see [Documentation Update Policies](./README.md#documentation-update-policies)). When requirements change, append an **Amendments** section — do not modify the original content.

```markdown
---

## Amendments

### [YYYY-MM-DD]

**Change**: [Brief description of what changed]

**Reason**: [Why the change was necessary]

**Impact**: [Effect on scope or acceptance criteria]
```

Multiple amendments are appended chronologically.
