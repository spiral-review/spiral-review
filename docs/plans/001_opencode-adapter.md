# 001: OpenCode reviewer adapter

## Overview

Spike for the roadmap item "OpenCode adapter": a reviewer adapter interface in the core and a first adapter on `@opencode-ai/sdk` running one read-only reviewer on a git diff, with findings returned as zod-validated structured output. It also records what the SDK reports per message (tokens, cost), to answer the "Budget units" open question.

## References

- [ADR-001](../adr/ADR-001_general-design.md) D2 (reviewer runner), D7 (core as a library)
- [ADR-002](../adr/ADR-002_toolchain.md) D2 (zod)
- Source read: `@opencode-ai/sdk` 1.19.0, OpenCode server tag `v1.19.0`, `ai` 6.0.168 / `@ai-sdk/provider-utils` 4.0.23
- [OpenCode Go docs](https://opencode.ai/docs/go), [OpenCode Terms](https://opencode.ai/legal/terms-of-service)

## Prerequisites

| Prerequisite                                 | Status | Notes                         |
| -------------------------------------------- | ------ | ----------------------------- |
| Scaffold                                     | Done   | strict TS, vitest, CI         |
| `opencode` installed and logged in (locally) | Open   | Needed for the live test only |

## Breaking Changes

- [x] **No breaking changes** (new exports only; package is pre-alpha)

## Scope

### In Scope

- `Reviewer` interface, request/result/usage types, `ReviewerError` in the core.
- OpenCode adapter: server lifecycle, read-only reviewer agent, structured output, client-side validation and retries, usage mapping.
- Provisional findings schema (throwaway).
- Offline unit tests; live test gated by an env var.
- Findings on tokens, cost and retries, reported in the PR; roadmap updated.

### Out of Scope

- Findings schema and blocking rule — open question.
- Budget ledger — separate roadmap item; the "Budget units" decision is the user's, made from the findings here.
- Large diffs — open question; the diff is sent as-is.
- Configuration, CLI wiring, lenses, consolidator — later roadmap items.
- Other adapters (e.g. Claude Agent SDK) — the interface must allow them, none is built.

## Technical Approach

The core defines a runner-neutral `Reviewer`: the core calls `review()` with a diff, instructions and a zod schema, and gets back validated output plus usage. The adapter owns everything OpenCode-specific; nothing from the SDK leaks into `src/core`.

Facts from the source that shape the design:

- Structured output (`format: json_schema`) exists only in the SDK's `/v2` entry point.
- The server does **not** validate the `StructuredOutput` tool input against the schema, and does **not** use `retryCount`.
- Per message the SDK returns `tokens` (input, output, reasoning, cache read/write) and `cost`. `cost` is computed by OpenCode from its model price catalog, not reported by the provider.
- Permissions default to `ask`, which would hang a headless server; rules are last-match-wins.
- The SDK starts `opencode serve` on port 4096 by default; `serve` accepts port 0.
- `OPENCODE_CONFIG_CONTENT` is merged after the repo's `opencode.json`.

### Key Decisions

| Decision           | Chosen Option                                                         | Rationale                                                              |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Output typing      | Generic over a zod schema (`ReviewRequest<T>`)                        | Findings schema is undecided; the consolidator needs a different shape |
| Model identifier   | Opaque string interpreted by the adapter                              | `provider/model` is OpenCode's naming; other runners differ            |
| Validation/retries | Client-side zod validation; re-prompt same session with the error     | Server does neither                                                    |
| Read-only          | Dedicated agent: `"*": deny`, allow only read, grep, glob, list       | Deny by default; nothing can fall back to `ask`                        |
| Server             | Started lazily on port 0, reused across reviews, stopped by `close()` | Parallel reviewers must not clash; avoid one startup per review        |
| SDK version        | Pinned exactly                                                        | The v2 API is coupled to the server version                            |
| Errors             | `ReviewerError` with a `kind` and usage so far                        | Core can fail open (R7) and still count spend                          |

### Risks & Trade-offs

| Risk/Trade-off                                               | Impact | Mitigation                                                          |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------- |
| Installed `opencode` version differs from the pinned SDK     | Medium | Live test records the server version; version check later in `init` |
| User plugins/MCP servers still load in the reviewer's server | Low    | MCP tools are denied by `"*"`; documented                           |
| `cost` is an estimate; Go limits are in dollars at Go prices | Medium | Live test compares `cost` with the Go console                       |
| Retries spend quota                                          | Low    | `maxAttempts` default 2; usage summed across attempts               |

## Implementation

`review()`: create a session in `cwd` with the reviewer agent, send instructions plus the diff as one text part with the zod schema as JSON Schema, validate `structured` with zod, and on a missing or invalid result re-prompt the same session with the validation error, up to `maxAttempts`. Timeout and abort call `session.abort` and raise `ReviewerError`. Usage sums tokens, cost and steps over all attempts.

### Files to Create

| File Path                                     | Purpose                                    |
| --------------------------------------------- | ------------------------------------------ |
| `src/core/reviewer.ts`                        | Reviewer interface, types, `ReviewerError` |
| `src/core/findings.ts`                        | Provisional findings schema                |
| `src/adapters/opencode/reviewer.ts`           | OpenCode adapter                           |
| `src/adapters/opencode/reviewer.test.ts`      | Offline tests with a fake client           |
| `src/adapters/opencode/reviewer.live.test.ts` | Live test, skipped unless `SPIRAL_LIVE=1`  |

### Files to Modify

| File Path         | Why                                                     |
| ----------------- | ------------------------------------------------------- |
| `package.json`    | Add `@opencode-ai/sdk` (exact pin)                      |
| `src/index.ts`    | Export the reviewer API                                 |
| `docs/ROADMAP.md` | Tick the item; record the findings under "Budget units" |
| `README.md`       | One Development line on the live test                   |

## Testing Strategy

- Offline (fake client behind a narrow internal port): agent permission config, JSON Schema sent, valid output, retry on invalid then valid output, exhausted retries, usage summed across attempts, error-kind mapping, timeout/abort.
- Live (`SPIRAL_LIVE=1`, real `opencode`): review a small fixture diff, log the raw assistant message (tokens, cost, structured, error), check that a denied tool is refused, compare `cost` with the provider console.

## Acceptance Criteria

- A reviewer produces zod-validated findings from a fixture diff through OpenCode (live test).
- The reviewer cannot edit, run shell commands or fetch the web (verified live).
- The PR reports what the SDK exposes per message and how structured-output retries behave, each marked verified live or from source.
- No SDK types appear in `src/core`.
- `pnpm check` passes.
