# PRD-001: Change classification, escalators and merge policy

**Status**: Draft
**Date**: 2026-11-03
**Author**: Luca Dalla Valle

## Problem

The risk tier treats "docs-only" as trivial ([decision log](../decisions.md), risk tiers). Under the three-loop development process (strategy, feature, execution: agentfiles common documentation, draft), a docs-only PR is often a roadmap, ADR, PRD or plan: the changes that most need a human. Owners also need stricter repo-specific checks than built-in rules and globs, a learned classifier (e.g. Jev, [open question](../ROADMAP.md#open-questions)) as an optional extra signal, and later opt-in auto-merge of low-risk work, without the coding agent ever being able to lower its own review.

## Goals

1. Every reviewed diff gets one classification: **kind** (docs / code / mixed), **loop** (strategy / feature / execution) and **tier** (trivial / standard / high-risk), each with recorded reasons.
2. The classification routes the review: code review for code, docs review for docs (PRD-002, planned, MVP), both for mixed; separate reviewer runs, one verdict and one digest.
3. Stricter repo-specific checks: globs first; **escalators** (commands or functions) where globs can't express the rule. A learned classifier is one escalator.
4. The classification is published per commit, the input for a later opt-in merge policy.
5. Nothing the coding agent can change in the diff lowers a classification.

## Non-Goals

- The docs review itself (lenses, categories, blocking rule, deterministic docs checks): PRD-002, in the MVP right after this one.
- Building the merge policy: post-MVP, its own PRD, after the prerequisites below. This PRD sets its direction and the statuses it reads.
- Building or choosing a learned classifier: escalators are vendor-neutral.
- GitHub Action or CI: commit statuses are posted by `spiral-review pr` via `gh` (ADR-001 D5).

## References

- [ROADMAP](../ROADMAP.md): Change classifier (MVP), Escalators, Later (Auto-merge), Open questions (Learned escalator, Repo-level config).
- [Decision log](../decisions.md): risk tier rules.
- [ADR-001](../adr/ADR-001_general-design.md) D5, D6, D7; [ADR-003](../adr/ADR-003_findings-and-review-policy.md) D5 (dismissals), D6 (large diffs).
- agentfiles common documentation: `docs/documentation/development_process.md` (draft; owns the loop-to-paths convention).

## Domain Concepts

| Term         | Meaning                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| kind         | docs (only documentation paths changed), code (none), mixed                                                                                                  |
| loop         | strategy (ADRs, `ROADMAP.md`, `STRATEGY.md`), feature (PRDs, plans, designs, decision log), execution (everything else)                                      |
| escalator    | a command or function that reads the classification and the diff and may only raise the tier or add `needs-human`                                            |
| merge policy | the owner's opt-in rules over the classification and verdict that say whether a PR may merge without a human; evaluated by spiral-review, enforced by GitHub |

Precedence: kind and loop come from paths only, deterministic; the highest loop among changed files wins; escalators never change them. Tier: built-in rules set the minimum, escalators run after and only raise (as in the ROADMAP).

Tier rules by kind and loop (minimums, on top of the existing sensitive-path, size and weakened-test rules):

| Kind and loop               | Minimum tier | `needsHuman` |
| --------------------------- | ------------ | ------------ |
| docs, execution             | trivial      | as today     |
| docs or mixed, feature      | standard     | yes          |
| docs or mixed, strategy     | standard     | yes          |
| code, or mixed in execution | as today     | as today     |

Docs paths are excluded from the size counts, like tests and lockfiles.

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

| Field                     | Type   | Required | Notes                                                                                                                                     |
| ------------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `loops.strategy`          | glob[] | no       | added to the defaults `**/docs/adr/**`, `**/ROADMAP.md`, `**/STRATEGY.md`                                                                 |
| `loops.feature`           | glob[] | no       | added to the defaults `**/docs/prd/**`, `**/docs/plans/**`, `**/docs/design/**`, `**/docs/decisions.md`                                   |
| `docs`                    | glob[] | no       | paths counted as documentation; added to the defaults `**/*.md`, `**/*.markdown`, `**/*.rst`, `**/*.adoc` (not `docs/**`, `.mdx`, `.txt`) |
| `escalators[].name`       | string | yes      | shown in reasons                                                                                                                          |
| `escalators[].command`    | string | yes      | run in the repo root, like gates; configured where gates are (`.spiral-review.toml` or a user-level per-repo entry, user-level wins)      |
| `escalators[].paths`      | glob[] | no       | the escalator's dependencies (modules, model or config files); sensitive paths                                                            |
| `escalators[].timeout_ms` | int    | no       | default 10000 (runs in the per-turn hook, R4)                                                                                             |

## Validation Rules

| Rule                                      | Error Code                   |
| ----------------------------------------- | ---------------------------- |
| Escalator name is non-empty and unique    | `ESCALATOR_NAME_INVALID`     |
| Escalator command is non-empty            | `ESCALATOR_COMMAND_REQUIRED` |
| Escalator timeout is a positive integer   | `ESCALATOR_TIMEOUT_INVALID`  |
| Loop and docs globs are non-empty strings | `TIERS_GLOB_INVALID`         |
| Escalator paths are non-empty globs       | `ESCALATOR_PATHS_INVALID`    |

Invalid config is a `ConfigError`, as today.

## Interface

- **Escalator protocol** (version 1):
  - stdin: JSON `{ version: 1, context: "hook" | "pr", base, head, kind, loop, tier, needsHuman, reasons, files: [{ path, status, additions, deletions }], diff, diffTruncated }`. `files` is complete; `diff` is bounded as in ADR-003 D6; the escalator runs in the repo root and may run `git` itself.
  - stdout: empty or `{}` means no change; else `{ tier?: "trivial" | "standard" | "high-risk", needsHuman?: true, reason }`, `reason` required when a field is set. A lower tier or `needsHuman: false` is ignored and recorded. stderr is saved under `.spiral-review/`.
  - `reason` is untrusted: truncated (about 200 characters) and escaped in the digest, never put in a reviewer prompt.
  - All escalators run in parallel on the rules-only classification; results combine by maximum, so order doesn't matter.
  - They run in both the hook and `pr`; results are cached by diff hash (R8).
  - Failure (non-zero exit, timeout, invalid JSON, schema mismatch): tier unchanged, `needsHuman` set, reason names the escalator and failure; work is never blocked (R7).
- **Escalator as a function:** in the core an escalator is `(input, signal: AbortSignal) => Promise<result>` with the protocol v1 shapes; the command runner is one implementation. The library API's `classify()` accepts functions directly (timeout via the signal, best effort: no kill). Config declares only commands; the package exports `defineEscalator(fn)` (`spiral-review/escalator`) so a command can be written as a function. No in-process modules from config: a hung or crashing module would hang or kill the hook (R7).
- **Threat model:** escalators, like gates, are repo code run unsandboxed. The rules stop a coding agent quietly weakening its review in the diff; they don't stop an agent with a shell that is set on cheating. Only a sandbox isolates, and that is the user's environment, not spiral-review (ROADMAP Out of scope). The `init` guard blocks agent file-tool writes to `~/.config/spiral-review/` and to escalator commands outside the repo; the digest names the config source and each escalator's command.
- **Commit statuses**, posted by `pr` and `pr --create` (never the hook) on the exact head SHA reviewed; a new push has none until `pr` runs again, so it reads as unreviewed:
  - `spiral-review/classification`: always `success` (informational); description e.g. `docs · feature · standard · needs-human`.
  - `spiral-review/verdict`: `pending` at start; `success` with no open blocking findings; `failure` with blocking findings open (round cap); `error` when the review failed open (R7). Description e.g. `2 open · 1 dismissed · reviewed 14/22 files`; `target_url` is the digest comment.
  - A required status check sees only the state, so GitHub can't evaluate kind, loop or tier itself.
  - The `needs-human` label stays the human-facing signal (R10). Posted with the user's `gh` token, neither label nor statuses are tamper-proof: the coding agent can post or remove them too.
- **Digest:** the first line gains kind and loop next to the tier; reasons are listed with the tier reasons.

## Routing

- Docs files are never sent to the code reviewer; it may read them as context.
- Until PRD-002 lands, docs get no LLM review: the digest says "docs: not reviewed", never clear. Strategy and feature docs keep `needsHuman`.
- Docs coverage is reported apart from the ADR-003 D6 code coverage and does not count against it.

## Merge Policy (direction, post-MVP)

- R10 amended: humans own every merge unless the owner opts a repo into a merge policy; default off.
- spiral-review evaluates the policy (GitHub sees only status states) and posts `spiral-review/merge-policy`: `success` if the PR may merge without a human, else `failure` with the reason. A GitHub required check and native auto-merge act on it.
- Rules in `[merge]` of `.spiral-review.toml` (e.g. `auto = true`, `max_tier = "trivial"`); editing them is a sensitive-path change, so that PR never qualifies itself.
- A PR qualifies only when: execution loop, `needsHuman` false, verdict `success`, full coverage, gates passed, no self-dismissed finding unaccepted by a consolidator or human, tier at most `max_tier` (default trivial; standard opt-in). High-risk, feature and strategy never qualify. A trivial PR had no LLM review, only gates.
- Prerequisites: reviewer metrics show low-risk reviews reliable; classifier proven; statuses posted by an identity the coding agent can't use (the GitHub Action or a GitHub App), with the required check pinned to that source.

## Edge Cases

- Mixed PR with a plan amendment and code (the development process reviews amendments in the same PR): loop feature, at least standard, `needsHuman`, both reviews.
- The coding agent edits an escalator script or the loop globs: every `command` token that resolves to a repo file, `escalators[].paths` and the config file are sensitive paths, so the PR is high-risk whatever the escalator returns.
- An escalator fails, times out or returns invalid JSON: tier unchanged, `needsHuman` set, reason recorded. A trivial diff stays trivial (no review until the human reads the digest): accepted, since raising to standard would make a broken escalator cost a review every turn.
- A hosted escalator (e.g. a vendor API) sends the diff to another data processor, like reviewer providers (ADR-001 consequences). Configuring it is the opt-in; there is no `hosted` flag (unenforceable). Keys never go in config: the escalator reads its own environment, passed through unchanged. To spend calls only on `pr`, it returns `{}` when `context` is `hook`. A `.spiral-review.toml` in a repo you don't own can send your diff anywhere through its escalators, exactly as through its gates.
- Docs-only typo in an execution-loop doc (e.g. `README.md`): kind docs, loop execution, tier trivial, as today.
- Config can only add loop and docs globs, never remove a default: removing one would lower review.
- Agent-config Markdown (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `.claude/**`, `.opencode/**`, `.codex/**`): kind docs, but sensitive, so high-risk (`.spiral-review.toml` is not docs, and sensitive too); the built-in sensitive globs must cover these directories.
- A docs-only PR rewriting a `Made By: owner` row in `docs/decisions.md`: loop feature, so standard and `needsHuman`.
- An ADR written during execution: loop strategy (paths approximate the process loop; erring high is safe). Strategy content outside the default paths needs an added glob or an escalator.
- A repo without the loop layout (e.g. a repo you only contribute to): defaults apply; everything not matched is execution.
- Escalators configured only in user-level config for a repo you don't own (R13): they run the same way; the config source is named.

## Scope

- MVP: classification (kind, loop, tier, `needsHuman`, reasons, config source), loop and docs globs, routing (docs "not reviewed" until PRD-002), statuses `classification` and `verdict` in `pr`. Until escalators ship, an `escalators` key is a `ConfigError` (strict validation).
- After the MVP: escalators (protocol v1, function interface, `defineEscalator`; [ADR-004](../adr/ADR-004_escalator-protocol.md), proposed, accepted before they ship), then the merge policy (own PRD).

## Acceptance Criteria

AC4–AC7 are post-MVP (escalators); the rest are MVP.

- **AC1**: Given a diff touching only `docs/adr/ADR-004_x.md`, when classified, then kind is docs, loop strategy, tier at least standard and `needsHuman` true.
- **AC2**: Given a diff touching only `README.md` whitespace, when classified, then kind docs, loop execution, tier trivial.
- **AC3**: Given a diff touching `docs/plans/003_x.md` and `src/a.ts`, when classified, then kind mixed, loop feature, tier at least standard, `needsHuman` true, and both reviews run.
- **AC3b**: Given a docs-only diff of 600 lines in `docs/prd/`, when classified, then tier is standard, not high-risk (docs lines are not counted).
- **AC4**: Given an escalator returning `{ "tier": "high-risk", "reason": "billing" }` on a standard diff, when classified, then tier is high-risk with reason `escalator:<name>: billing`.
- **AC5**: Given an escalator returning `{ "tier": "trivial", "reason": "x" }` on a standard diff, when classified, then tier stays standard and the ignored result is recorded.
- **AC5b**: Given two escalators raising to standard and high-risk, when classified in either config order, then tier is high-risk with both reasons.
- **AC5c**: Given an escalator returning `{ "tier": "high-risk" }` without `reason`, when classified, then it is treated as a failure.
- **AC6**: Given an escalator that times out, when classified, then tier is unchanged, `needsHuman` is true and the reason names the timeout; the command exits as it would without the escalator.
- **AC7**: Given a diff that edits an escalator's script, when classified, then tier is high-risk with a sensitive-path reason.
- **AC7b**: Given a docs-only diff in `docs/prd/`, when reviewed before PRD-002 lands, then no code reviewer runs on it and the digest says "docs: not reviewed".
- **AC7c**: Given a diff touching only `docs/decisions.md`, when classified, then loop is feature, tier standard and `needsHuman` true.
- **AC8**: Given `spiral-review pr` on a PR, when it completes, then commit statuses `spiral-review/classification` and `spiral-review/verdict` exist on the head SHA.
- **AC8b**: Given `pr` where the review fails open, when it completes, then `spiral-review/verdict` is `error` on the head SHA.
