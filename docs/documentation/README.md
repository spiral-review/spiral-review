# Documentation

## Table of Contents

1. [Guidelines](#guidelines)
2. [Documentation Update Policies](#documentation-update-policies)
3. [Technical Documentation](#technical-documentation)
   1. [Guidelines](#guidelines-1)
   2. [Design documents](#design-documents)
      1. [Architecture Decision Records (ADRs)](#architecture-decision-records-adrs)
      2. [Decision Log](#decision-log)

## Guidelines

- There are different types of documentation:
  1. Technical documentation - Project specific
     - Design documents (Architecture Decision Records - ADRs and decision logs)
     - Implementation plans ([template](./plan_template.md), naming: `NNN_short-name.md`)
  2. Pull Requests
  3. Git commits
  4. Product documentation (PRDs ([template](./prd_template.md), naming: `NNN_short-name.md`), ROADMAP.md, STRATEGY.md)

## Documentation Update Policies

Different documentation types have different update strategies. The key principle: **point-in-time decisions should remain point-in-time artifacts; the code is the ultimate source of truth for current behavior.**

| Document Type                          | Update Policy                                                              | Rationale                                       |
| -------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| Product Strategy and Goals             | **Living**                                                                 | Define product strategy and goals               |
| Product Roadmap                        | **Living**                                                                 | Define product tactical-level macro steps       |
| Product Requirement Definitions (PRDs) | **Immutable** after merge amend separately if needed                       | Define product requirements and features        |
| Implementation Plans                   | **Immutable** after approval; amend separately if needed                   | Preserves estimation basis and decision history |
| ADRs                                   | **Immutable**; supersede with new ADRs                                     | Creates auditable decision trail                |
| README / Usage docs                    | **Living**; update with code                                               | Must reflect current behavior                   |
| API docs                               | **Living**; ideally auto-generated                                         | Must match actual API surface                   |
| Decision Log                           | **Living**; update when ADRs change or other important decisions are taken | Summary document, links to immutable documents  |

### Why Immutable Planning Artifacts?

- They serve as a historical record of what was decided and why at that moment
- The code becomes the living source of truth for "how it works now"
- Updating specs retroactively creates confusion: did we plan this, or was it a later change?
- Preserves the estimation basis (story points were based on this scope)
- Enables retrospective learning (planned vs actual)

### Handling Changes to Immutable Documents

If requirements change after a plan is approved:

1. **Do not modify** the original document
2. Add a **comment/amendment section** at the end noting the deviation
3. For significant changes, create a **new document** that references the original

## Technical Documentation

### Guidelines

- We store technical documentation in code, alongside application code.
- This is the kind of documentation we expect to have for each specific project:
  - README.md
    - Introduction
    - Getting started
      - Onboarding links
        - Machine-wide setup instructions
      - Project-specific setup instructions, if applicable
    - Project structure
    - How to compile/build/test each of the projects
    - [Design Decision Log](https://microsoft.github.io/code-with-engineering-playbook/design/design-reviews/decision-log/) link
    - Contributing
      - Coding conventions
      - Source control documentation (branching/merging strategy)
  - Design documents
    - [Architecture Decision Records](https://adr.github.io/) (including the High-level architecture overview, see below).
    - [Design Decision Log](https://microsoft.github.io/code-with-engineering-playbook/design/design-reviews/decision-log/) document (see below).
- This is the project structure we define for project-specific docs:

        -root
          --src
          --docs <-- CI runs on docs too (format check)
            --adr <-- Architecture Decision Records
            --prd <-- Product requirements
            --plans <-- Implementation plans
            --design <-- UX design artifacts
            --decisions.md <-- decision log document
          README.md

### Design documents

- Not all requirements are identifiable at the start of an agile project.
- Initial architecture design may evolve or change throughout the project.
- It's important to document the context and reasoning behind an architecturally-significant decision, including the consequences for the team.

#### Architecture Decision Records (ADRs)

- We use ADRs to document architectural decisions.
- Our ADRs follow [our template](./adr_template.md).
- The naming of our ADRs follows the pattern `ADRXXX - Title`, where `XXX` is a three-digit number. Example:
  - Filename: `ADR-001_usage-of-adrs.md`
  - Title: `ADR-001 - Usage of ADRs in team projects`
- We store our ADRs in the `docs/adr` folder.

##### ADR Immutability

**Once accepted, an ADR is never edited** (except for typos or formatting). This is a core principle of the ADR pattern.

- If circumstances change, write a **new ADR** with status "Supersedes ADR-XXX"
- Update the original ADR's status to "Superseded by ADR-YYY"
- Never delete or substantially modify the original content

This immutability answers "why did we choose X?" even years later, including decisions that were later reversed.

##### Valid Status Values

| Status                | Meaning                                    |
| --------------------- | ------------------------------------------ |
| Proposed              | Under discussion, not yet accepted         |
| Accepted              | Decision is in effect                      |
| Deprecated            | No longer relevant (e.g., feature removed) |
| Superseded by ADR-XXX | Replaced by a newer decision               |

##### Superseding an ADR

When a decision changes, create a new ADR that includes a "Supersedes" section:

```markdown
## Supersedes

This ADR supersedes [ADR-XXX: Previous Title](./ADR-XXX_previous-title.md).

**Key changes from ADR-XXX:**

- [What changed and why]
```

#### Decision Log

- The Decision Log is a single document in the repo that summarizes all the decisions made during the project lifetime.
- It includes links to the ADRs and salient points.
- It uses our [Decision Log template](./decision_log_template.md).
- We store our Decision Logs in the `docs/decisions.md` path.
