# ADR-004 - Escalator protocol v1

| **Creation Date** | **Status** |
| :---------------: | :--------: |
|    2026-11-03     |  Proposed  |

## Table of Contents

1. [Context](#context)
2. [Decision](#decision)
3. [Alternatives considered](#alternatives)
4. [Consequences and Risks](#consequences)

<a id="context"></a>

## Context

[PRD-001](../prd/001_review-classification.md) adds escalators: repo-specific checks, such as a learned classifier, that run after the classification rules and may only raise the result. Owners write them as scripts in any language or as functions against the library (ADR-001 D7), so the protocol is a public contract that external code depends on. Escalators run in the per-turn hook (R4) and must never block work (R7) or let the coding agent lower its own review.

Proposed: accept before the Escalators roadmap item ships, after checking it against a concrete escalator (e.g. Jev, [learned escalator](../ROADMAP.md#open-questions)).

<a id="decision"></a>

## Decision

- **D1 - Two forms, one shape:** in the core an escalator is `(input, signal: AbortSignal) => Promise<result>`. Config declares only commands; the command runner adapts them to that function. The library's `classify()` also accepts functions directly (timeout via the signal, best effort). The package exports `defineEscalator(fn)` (`spiral-review/escalator`) to write a command as a function.
- **D2 - Input** (command: JSON on stdin): `{ version: 1, context: "hook" | "pr", base, head, kind, loop, tier, needsHuman, reasons, files: [{ path, status, additions, deletions }], diff, diffTruncated }`. `files` is complete; `diff` is bounded as in ADR-003 D6. Commands run in the repo root and inherit the environment unchanged; spiral-review holds no escalator keys.
- **D3 - Output** (command: JSON on stdout): empty or `{}` means no change; else `{ tier?: "trivial" | "standard" | "high-risk", needsHuman?: true, reason }`, `reason` required when a field is set. A lower tier or `needsHuman: false` is ignored and recorded. `reason` is untrusted: truncated (about 200 characters), escaped in the digest, never put in a reviewer prompt. stderr is saved under `.spiral-review/`.
- **D4 - Combination:** all escalators run in parallel on the rules-only classification; results combine by maximum, so config order doesn't matter. They never change kind or loop. Results are cached by diff hash (R8).
- **D5 - Failure:** non-zero exit, timeout (default 10 s), invalid JSON or schema mismatch leave the tier unchanged, set `needsHuman` and record a reason naming the escalator. Work is never blocked.
- **D6 - Versioning:** `version` changes only on a breaking change to input or output; adding optional input fields is not breaking. An escalator ignores unknown input fields.

<a id="alternatives"></a>

## Alternatives considered

- **In-process modules from config (D1):** a timeout can't stop a hung function, and a crash or `process.exit` kills the hook (R7); Node-only.
- **Sequential chaining (D4):** each escalator would see the previous result; order-dependent outcomes and summed latency in the hook.
- **Exit codes instead of JSON (D3):** no reason, no `needsHuman`, no room to grow.
- **Failure raises trivial to standard (D5):** safer for one diff, but a broken escalator would cost a review every turn.
- **A `hosted` flag per escalator:** spiral-review can't verify it; false assurance.

<a id="consequences"></a>

## Consequences and Risks

- Escalators are repo code run unsandboxed, like gates; isolation is the user's environment (ROADMAP Out of scope).
- A hosted escalator sends the diff to another data processor; configuring it is the opt-in, and the digest names every escalator that ran.
- A failing escalator on a trivial diff leaves it unreviewed until the human reads the digest.
- The coding agent editing an escalator's script or `paths` makes the PR high-risk; editing a script outside the repo is only stopped by the `init` guard on file tools.
