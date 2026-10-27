# ADR-003 - Findings and review policy

| **Creation Date** | **Status** |
| :---------------: | :--------: |
|    2026-10-26     |  Accepted  |

## Table of Contents

1. [Context](#context)
2. [Decision](#decision)
3. [Alternatives considered](#alternatives)
4. [Consequences and Risks](#consequences)

<a id="context"></a>

## Context

The hook, `pr`, the digest, loop guards and metrics all consume findings; [plan 001](../plans/001_opencode-adapter.md) used a throwaway schema. With an agent author, every blocking false positive costs a round, and the MVP runs one unverified reviewer per review.

<a id="decision"></a>

## Decision

- **D1 - Reviewer output:** `{ findings, decisions }` ([`src/core/findings.ts`](../../src/core/findings.ts)). A finding has `file`, `line`, `quote` (exact code, the evidence), `category` (fixed enum), `title` (names the bug class), `body`, optional `failureScenario`, `severity` (critical / major / minor / nit), `confidence` (high / medium / low), `preExisting`. A decision is a change needing a human call, not a fix: digest only, adds `needs-human`.
- **D2 - Core-added fields:** `id` = `F-` + 6 hex of a hash of file, category and whitespace-normalized quote (no line, no wording, so it survives shifts and rephrasing); duplicates merge, keeping a blocking one, then the most severe. `cited` = quote found in the post-change file or the diff.
- **D3 - Blocking rule:** not pre-existing, cited, has a failure scenario, and critical with confidence ≥ medium or major with confidence high. Only blocking findings reach the coding agent; the rest are saved under `.spiral-review/` and listed in the digest.
- **D4 - Standard-tier noise:** no LLM verification step; D3's deterministic filters plus the coding agent's own verification (ADR-001 D4), bounded by the round cap. Revisit when more than 30% of the last 50 blocking findings are dismissed, or the digest shows real bugs dismissed; try a verify step on `pr --create` first.
- **D5 - Rejections:** `spiral-review dismiss <id> "<reason>"` records a rejection per branch under `.spiral-review/`; dismissed IDs stop blocking and appear in the digest as rejected. Minimal subset of the accept/reject protocol.
- **D6 - Large diffs:** drop lockfiles, generated and skipped paths (listed by name). Over `max_diff_bytes` (default 100 KB), include whole-file diffs by priority (sensitive paths, source, tests) up to the limit and list the rest; the reviewer may read them. Coverage ("reviewed 14/22 files") goes to the status line and digest; partial coverage on `pr` adds `needs-human`.

<a id="alternatives"></a>

## Alternatives considered

- **LLM verification pass (D4):** extra quota and latency on every blocking turn; the coding agent already verifies.
- **Block only on critical (D3, D4):** most real bugs would only reach the digest.
- **Free-text bug class or line in the ID (D2):** reworded titles and shifted lines would change IDs between rounds.
- **Split large diffs into several reviews (D6):** multiplies quota and hook latency; revisit with the gauntlet and budget ledger.
- **Escalate every large diff to the human (D6):** large diffs would get no review.

<a id="consequences"></a>

## Consequences and Risks

- Self-reported confidence is poorly calibrated; `stats` should calibrate it per model.
- A reviewer quoting a different line for the same bug yields a new ID.
- A weak model may label noise major / high; measure with `stats` and reviewer evals before adding a verifier.
- Truncated reviews can miss bugs in omitted files; reported, never hidden.
