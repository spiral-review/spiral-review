# PRD-001: Change classification, escalators and merge policy

**Status**: Draft
**Date**: 2026-11-03
**Author**: Luca Dalla Valle

## Problem

The risk tier treats "docs-only" as trivial ([decision log](../decisions.md), risk tiers). Under the three-loop development process (strategy, feature, execution: agentfiles common documentation, draft), a docs-only PR is often a roadmap, ADR, PRD or plan: the changes that most need a human. Owners also need stricter repo-specific checks than built-in rules and globs, a learned classifier (e.g. Jev, [open question](../ROADMAP.md#open-questions)) as an optional extra signal, and later opt-in auto-merge of low-risk work, without the coding agent ever being able to lower its own review.

## Goals

1. Every reviewed diff gets one classification: **kind** (docs / code / mixed), **loop** (strategy / feature / execution) and **tier** (trivial / standard / high-risk), each with recorded reasons.
2. The classification routes the review: code review for code, docs review for docs (its lenses: separate PRD), both for mixed.
3. Stricter repo-specific checks: globs first; **escalators** (commands) where globs can't express the rule. A learned classifier is one escalator.
4. The classification is published per commit, so a merge policy outside spiral-review can act on it (prerequisite for opt-in auto-merge).
5. Nothing the coding agent can change in the diff lowers a classification.

## Non-Goals

- Docs review lenses or skills: separate PRD, after this one.
- Auto-merge in the MVP: R10 holds ("Humans own every merge"); this PRD defines only the inputs. Changing R10 is an open question below.
- Building or choosing a learned classifier: escalators are vendor-neutral.
- GitHub Action or CI: commit statuses are posted by `spiral-review pr` via `gh` (ADR-001 D5).

## References

- [ROADMAP](../ROADMAP.md): Risk tier classifier (MVP), Out of scope (Auto-merge prerequisites), Open questions (Learned escalator, Repo-level config).
- [Decision log](../decisions.md): risk tier rules.
- [ADR-001](../adr/ADR-001_general-design.md) D5, D6, D7; [ADR-003](../adr/ADR-003_findings-and-review-policy.md) D5 (dismissals), D6 (large diffs).
- agentfiles common documentation: `docs/documentation/development_process.md` (draft; owns the loop-to-paths convention).

## Domain Concepts

| Term         | Meaning                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| kind         | docs (only documentation paths changed), code (none), mixed                                                 |
| loop         | strategy (ADRs, `ROADMAP.md`, `STRATEGY.md`), feature (PRDs, plans), execution (everything else)            |
| escalator    | a command that reads the classification and the diff and may only raise the tier or add `needs-human`       |
| merge policy | rules over kind, loop, tier and verdict that say whether a PR may merge without a human; enforced by GitHub |

Precedence: kind and loop come from paths only, deterministic; the highest loop among changed files wins. Tier: built-in rules set the minimum, escalators run after and only raise (as in the ROADMAP).

## Data Model

Classification (saved under `.spiral-review/`, in the digest, and as commit statuses):

| Field          | Type                                                       | Required | Notes                                      |
| -------------- | ---------------------------------------------------------- | -------- | ------------------------------------------ |
| `kind`         | `docs` \| `code` \| `mixed`                                | yes      | from paths                                 |
| `loop`         | `strategy` \| `feature` \| `execution`                     | yes      | highest loop among changed paths           |
| `tier`         | `trivial` \| `standard` \| `high-risk`                     | yes      | rules, then escalators (raise only)        |
| `needsHuman`   | boolean                                                    | yes      | rules, escalators, existing R10 triggers   |
| `reasons`      | `{ source: "rule" \| "escalator:<name>", text: string }[]` | yes      | every fired rule and escalator result      |
| `configSource` | string                                                     | yes      | which config file set loops and escalators |

Config (`[tiers]` table, alongside `max_lines`, `max_files`, `sensitive`):

| Field                     | Type   | Required | Notes                                                                                      |
| ------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------ |
| `loops.strategy`          | glob[] | no       | default: `docs/adr/**`, `ROADMAP.md`, `docs/ROADMAP.md`, `STRATEGY.md`, `docs/STRATEGY.md` |
| `loops.feature`           | glob[] | no       | default: `docs/prd/**`, `docs/plans/**`                                                    |
| `docs`                    | glob[] | no       | paths counted as documentation; default: `**/*.md`, `docs/**`                              |
| `escalators[].name`       | string | yes      | shown in reasons                                                                           |
| `escalators[].command`    | string | yes      | run in the repo root, like gates                                                           |
| `escalators[].timeout_ms` | int    | no       | default 30000                                                                              |

## Validation Rules

| Rule                                      | Error Code                   |
| ----------------------------------------- | ---------------------------- |
| Escalator name is non-empty and unique    | `ESCALATOR_NAME_INVALID`     |
| Escalator command is non-empty            | `ESCALATOR_COMMAND_REQUIRED` |
| Escalator timeout is a positive integer   | `ESCALATOR_TIMEOUT_INVALID`  |
| Loop and docs globs are non-empty strings | `TIERS_GLOB_INVALID`         |

Invalid config is a `ConfigError`, as today.

## Interface

- **Escalator protocol:** stdin is JSON `{ kind, loop, tier, needsHuman, reasons, files: [{ path, status, additions, deletions }], diff }` (diff bounded as in ADR-003 D6). Stdout is JSON `{ tier?: "standard" | "high-risk", needsHuman?: boolean, reason: string }`. A lower tier than the current one is ignored and recorded.
- **Commit statuses** on the head SHA, posted by `spiral-review pr`: `spiral-review/classification` (kind, loop, tier in the description) and `spiral-review/verdict`. A GitHub required status check, configured by the owner, is where any merge policy is enforced.
- **Digest:** the first line gains kind and loop next to the tier; reasons are listed with the tier reasons.

## Edge Cases

- Mixed PR with a plan amendment and code (the development process reviews amendments in the same PR): loop feature, both reviews.
- The coding agent edits an escalator script or the loop globs: escalator commands' files and `[tiers]` are sensitive paths automatically, so the PR is high-risk.
- An escalator fails, times out or returns invalid JSON: tier unchanged, `needsHuman` set, reason recorded. Work is never blocked (R7), and a failed check can't silently lower review.
- An escalator sends the diff to a hosted vendor: opt-in by configuring it; the digest names every escalator that ran.
- Docs-only change to `REVIEW.md`, `.spiral-review.toml` or `AGENTS.md`: kind docs, but sensitive, so high-risk.
- Docs-only typo in an execution-loop doc (e.g. `README.md`): kind docs, loop execution, tier trivial, as today.
- A repo without the loop layout (e.g. a repo you only contribute to): defaults apply; everything not matched is execution.
- Escalators configured only in user-level config for a repo you don't own (R13): they run the same way; the config source is named.

## Acceptance Criteria

- **AC1**: Given a diff touching only `docs/adr/ADR-004_x.md`, when classified, then kind is docs, loop strategy, tier at least standard and `needsHuman` true.
- **AC2**: Given a diff touching only `README.md` whitespace, when classified, then kind docs, loop execution, tier trivial.
- **AC3**: Given a diff touching `docs/plans/003_x.md` and `src/a.ts`, when classified, then kind mixed, loop feature, and both reviews run.
- **AC4**: Given an escalator returning `{ "tier": "high-risk", "reason": "billing" }` on a standard diff, when classified, then tier is high-risk with reason `escalator:<name>: billing`.
- **AC5**: Given an escalator returning `{ "tier": "trivial" }` on a standard diff, when classified, then tier stays standard and the ignored result is recorded.
- **AC6**: Given an escalator that times out, when classified, then tier is unchanged, `needsHuman` is true and the reason names the timeout; the command exits as it would without the escalator.
- **AC7**: Given a diff that edits an escalator's script, when classified, then tier is high-risk with a sensitive-path reason.
- **AC8**: Given `spiral-review pr` on a PR, when it completes, then commit statuses `spiral-review/classification` and `spiral-review/verdict` exist on the head SHA.

## Open Questions

- Replace the decision log row "trivial = docs-only" with: docs-only is trivial only in the execution loop; strategy docs are at least standard plus `needsHuman`; feature docs at least standard?
- R10: allow opt-in auto-merge through a merge policy enforced by a GitHub required check, once reviewer metrics prove low-risk reviews reliable (the ROADMAP prerequisites)? Which combinations qualify (e.g. execution loop, trivial, clear verdict, no self-dismissed findings)?
- Where the loop-to-paths defaults come from: the agentfiles common documentation convention, copied into spiral-review's defaults, or read from the repo?
- Escalators in the MVP, which today is "rules only, no escalators"?
- Escalators in a repo's `.spiral-review.toml` run that repo's code, like gates. Allowed in repos you don't own, or user-level only?
- The escalator protocol is a public contract: ADR?
