# Documentation

## Table of Contents

1. [Guidelines](#guidelines)
2. [Documentation Update Policies](#documentation-update-policies)
3. [Technical Documentation](#technical-documentation)
   1. [Guidelines](#guidelines-1)
   2. [Design documents](#design-documents)
      1. [Architecture Decision Records (ADRs)](#architecture-decision-records-adrs)
      2. [Decision Log](#decision-log)
4. [Agent Execution](#agent-execution)
   1. [Gate and Definition of Done](#gate-and-definition-of-done)
   2. [AGENTS.md](#agentsmd)
   3. [Handover](#handover)

## Guidelines

- How work flows through the strategy, feature and execution loops: [development process](./development_process.md).
- There are different types of documentation:
  1. Technical documentation - Project specific
     - Design documents (Architecture Decision Records - ADRs and decision logs)
     - Implementation plans ([template](./plan_template.md), naming: `NNN_short-name.md`)
     - Agent execution: `AGENTS.md` (gate, domain words) and `docs/HANDOVER.md` ([template](./handover_template.md))
  2. Source control: branching, merging, PRs and commits ([rules](./source_control.md))
  3. Product documentation (PRDs ([template](./prd_template.md), naming: `NNN_short-name.md`), ROADMAP.md, STRATEGY.md)
- `docs/documentation/` is a read-only copy of the common documentation, kept in sync by `agentfiles doctor --fix` (source of truth: the agentfiles repo). Never edit it in a project: record where the project deviates in `docs/decisions.md`, or change the common documentation in agentfiles.

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
| Handover                               | **Living**; overwritten at the end of each work session                    | Lets the next session resume without re-reading |

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
      - Source control documentation (branching/merging strategy): [common rules](./source_control.md)
  - Design documents
    - [Architecture Decision Records](https://adr.github.io/) (including the High-level architecture overview, see below).
    - [Design Decision Log](https://microsoft.github.io/code-with-engineering-playbook/design/design-reviews/decision-log/) document (see below).
- This is the project structure we define for project-specific docs:

        -root
          --src
          --docs <-- CI runs on docs changes too
            --adr <-- Architecture Decision Records
            --prd <-- Product requirements
            --plans <-- Implementation plans
            --design <-- UX design artifacts
            --decisions.md <-- decision log document
            --HANDOVER.md <-- current state for the next work session
          AGENTS.md <-- gate command, domain words
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

##### Which level a decision belongs to

| Level          | Where                                | When                                                                         |
| -------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Design         | PRD or plan, before coding           | Settled up front; agents don't reopen it without the owner                   |
| Implementation | Decision log row, no ADR             | A choice the PRD/plan doesn't cover; the agent appends it with its reasoning |
| Architecture   | ADR + decision log row linking to it | Architecture, public API/contract behaviour, or hard-to-reverse choices      |

- Agents append implementation-level rows as they work (`Made By: agent`); the owner reviews them after merge, in the decision log.
- A reversed decision gets a new row that names the one it replaces; old rows are not deleted.

## Agent Execution

How coding agents run plans in this project. The goal: agents can work unattended, and their "done" can be trusted without watching them.

### Gate and Definition of Done

- Each project has **one gate command** (build, lint, format check, every test), named in `AGENTS.md`. CI runs the same command.
- A plan chunk or PR is done only when the gate passes, with its **real output** in the PR or commit. A summary written by the agent is not evidence.
- **Never weaken, skip or delete a test** to make the gate pass. If a test or the gate looks wrong, stop and ask the owner.
- Recommended: a check in the gate that fails on stub markers (e.g. `NotImplementedException`, `TODO: implement`) and on skipped tests.

### AGENTS.md

Besides roles and conventions, each project's `AGENTS.md` has:

- **Gate**: the single command from above, plus how to run the app.
- **Domain words**: one line per term, with words to avoid so names stay consistent. Example:
  `- draft: the editable set of resources for one environment. Avoid: workspace, working copy.`

### Handover

- `docs/HANDOVER.md` ([template](./handover_template.md)) holds the current state: where we are, how to prove it, the next action, decisions not to reopen.
- An agent reads it at the start of a session and overwrites it at the end. History lives in PRs, commits and the decision log, not here.
