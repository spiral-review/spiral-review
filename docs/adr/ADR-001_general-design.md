# ADR-001 - General design: runtime, reviewer runner, integrations

| **Creation Date** | **Status** |
| :---------------: | :--------: |
|    2026-10-10     |  Proposed  |

## Table of Contents

1. [Context](#context)
2. [Decision](#decision)
3. [Alternatives considered](#alternatives)
4. [Consequences and Risks](#consequences)

<a id="context"></a>

## Context

spiral-review reviews changes made by a coding agent (Claude Code) for a solo developer on flat-rate subscriptions: Claude Pro for coding, OpenCode Go for reviewers. Quotas belong to the account, not the repo. Anthropic restricts subscription (OAuth) credentials to Claude Code and Claude.ai.

A bash Stop-hook prototype ([review-with-opencode.sh](../prototypes/review-with-opencode.sh)) works but parses a text verdict (`VERDICT: BLOCK|OK`), which is fragile.

<a id="decision"></a>

## Decision

Decisions are numbered so a later ADR can supersede one of them alone.

- **D1 - Runtime:** TypeScript, strict mode. Distributed via npm (`npx spiral-review`); a single binary via `bun build --compile` may follow.
- **D2 - Reviewer runner:** reviewers run behind an adapter interface. The first adapter uses OpenCode through its official SDK `@opencode-ai/sdk`. Findings come back as structured JSON validated against a JSON Schema, never as parsed Markdown. Reviewers are read-only: edit, bash and webfetch are denied.
- **D3 - Claude Code integration:** only through Claude Code hooks. A Stop hook reviews the uncommitted diff, untracked files included, and on a blocking verdict returns `{"decision":"block","reason":...}` so the agent handles findings in the same session. spiral-review never uses Claude subscription credentials.
- **D4 - Hook behavior:** loop guards skip unchanged diffs (by hash) and cap consecutive blocking rounds per session. The agent is asked to verify each finding, fix valid ones and explain rejected ones. On reviewer error or timeout the hook fails open: it tells the user and lets the turn end.
- **D5 - Local-first:** everything runs on the developer's machine; no CI at first. `spiral-review pr` posts the digest via `gh` and adds a `needs-human` label for high-risk changes.
- **D6 - Configuration:** built-in defaults < `~/.config/spiral-review` < `.spiral-review.toml`. Built-in lens prompts can be overridden per repo.

<a id="alternatives"></a>

## Alternatives considered

- **Bash or Python (D1, D2):** bash is the prototype and does not scale to fan-out, schemas and a ledger. Python has an official SDK ([opencode-ai](https://pypi.org/project/opencode-ai/)), but it is a Stainless-generated REST client, still alpha, last released 2025-08, with no structured-output API in its docs. The TypeScript SDK lives in the main OpenCode repo and is actively maintained.
- **Text verdict parsing (D2):** works in the prototype, but fragile.
- **Calling Claude directly for reviews (D3):** not allowed with subscription credentials.
- **CI / GitHub Action (D5):** would need provider keys in CI and may conflict with subscription terms (unverified). May be added later.

<a id="consequences"></a>

## Consequences and Risks

- Users must install and authenticate OpenCode; reviewer quality and cost depend on the providers they configure.
- Code sent to reviewers (diff and files they read) is subject to those providers' data policies.
- Structured output support and per-message token/cost reporting in the SDK are unverified; to be checked before designing budgets.
- Stop hooks block the session while running; fan-out plus consolidation takes minutes and may exceed the hook timeout.
- Open questions not covered here: risk tier thresholds, findings schema and blocking rule, accept/reject protocol, budget units, degradation order, digest format.
