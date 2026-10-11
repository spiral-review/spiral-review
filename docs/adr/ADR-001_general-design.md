# ADR-001 - General design: runtime, core, reviewer runner, integrations

| **Creation Date** | **Status** |
| :---------------: | :--------: |
|    2026-10-10     |  Accepted  |

## Table of Contents

1. [Context](#context)
2. [Decision](#decision)
3. [Alternatives considered](#alternatives)
4. [Consequences and Risks](#consequences)

<a id="context"></a>

## Context

spiral-review reviews changes made by a coding agent for a solo developer on flat-rate subscriptions. Quotas belong to the account, not the repo. Two target setups:

- Claude Code (Claude Pro) for coding, OpenCode Go for reviewers. Anthropic restricts subscription (OAuth) credentials to Claude Code and Claude.ai.
- OpenCode for both coding and reviewing (a known prospective user).

A bash Stop-hook prototype ([review-with-opencode.sh](../prototypes/review-with-opencode.sh)) works but parses a text verdict (`VERDICT: BLOCK|OK`), which is fragile.

<a id="decision"></a>

## Decision

Decisions are numbered so a later ADR can supersede one of them alone.

- **D1 - Runtime:** TypeScript, strict mode. Distributed via npm (`npx spiral-review`); a single binary via `bun build --compile` may follow.
- **D2 - Reviewer runner:** reviewers run behind an adapter interface. The first adapter uses OpenCode through its official SDK `@opencode-ai/sdk`. Findings come back as structured JSON validated against a JSON Schema, never as parsed Markdown. Reviewers are read-only: edit, bash and webfetch are denied.
- **D3 - Coding-agent integrations:** behind an adapter interface. An adapter identifies the session and the changes (uncommitted diff, untracked files included), runs the core, delivers blocking findings back to the agent in the same session, and keeps per-session loop state.
  - First adapter: Claude Code, only through hooks. A Stop hook returns `{"decision":"block","reason":...}` on a blocking verdict. spiral-review never uses Claude subscription credentials.
  - Planned second adapter: an OpenCode plugin on `session.idle` that sends findings to the session through the SDK client (to be verified with a spike).
- **D4 - Integration behavior (all adapters):** loop guards skip unchanged diffs (by hash) and cap consecutive blocking rounds per session. The agent is asked to verify each finding, fix valid ones and explain rejected ones. On reviewer error or timeout the integration fails open: it tells the user and lets the turn end.
- **D5 - Local-first:** everything runs on the developer's machine; no CI at first. `spiral-review pr` posts the digest via `gh` and adds a `needs-human` label for high-risk changes.
- **D6 - Configuration:** built-in defaults < `~/.config/spiral-review` < `.spiral-review.toml`. Built-in lens prompts can be overridden per repo.
- **D7 - Core as a library:** gates, tiers, reviewers, consolidation, budgets, digest and metrics live in an agent-neutral core with a programmatic API, returning findings and a verdict. The CLI and the integration adapters are thin wrappers (an OpenCode plugin imports the package instead of spawning the CLI). The accept/reject protocol uses finding IDs in plain message text, not agent-specific features.

<a id="alternatives"></a>

## Alternatives considered

- **Bash or Python (D1, D2):** bash is the prototype and does not scale to fan-out, schemas and a ledger. Python has an official SDK ([opencode-ai](https://pypi.org/project/opencode-ai/)), but it is a Stainless-generated REST client, still alpha, last released 2025-08, with no structured-output API in its docs. The TypeScript SDK lives in the main OpenCode repo and is actively maintained.
- **Text verdict parsing (D2):** works in the prototype, but fragile.
- **Calling Claude directly for reviews (D3):** not allowed with subscription credentials.
- **Claude Code only, no integration seam (D3, D7):** simpler, but excludes OpenCode-only users and would require a rewrite of the hook path to add them.
- **CI / GitHub Action (D5):** would need provider keys in CI and may conflict with subscription terms (unverified). May be added later.

<a id="consequences"></a>

## Consequences and Risks

- Users must install and authenticate OpenCode; reviewer quality and cost depend on the providers they configure.
- Code sent to reviewers (diff and files they read) is subject to those providers' data policies.
- Structured output support and per-message token/cost reporting in the SDK are unverified; to be checked before designing budgets.
- When coding and reviewing share one provider quota (OpenCode-only setup), reviews compete with coding for it, and the same model may review its own code.
- The OpenCode plugin path (sending findings into the active session) is unverified.
- Stop hooks block the session while running; fan-out plus consolidation takes minutes and may exceed the hook timeout.
- Open questions are tracked in [ROADMAP.md](../ROADMAP.md#open-questions).
