# 001: OpenCode reviewer adapter

> **Revised 2026-10-15** for OpenCode 2.x, which is the installed version (2.0.26). The first version targeted `@opencode-ai/sdk` / server 1.19.0. 2.x has a different HTTP API, no structured output, and no public client. History: PR #6, `git log` on this file.

## Overview

Spike for the roadmap item "OpenCode adapter": a reviewer adapter interface in the core, and a first adapter on the OpenCode 2.x HTTP API. The adapter runs one read-only reviewer on a git diff and returns findings as zod-validated JSON. It also records what OpenCode reports per message (tokens, cost), to answer the "Budget units" open question.

## References

- [ADR-001](../adr/ADR-001_general-design.md) D2 (reviewer runner), D7 (core as a library); D2 deviation in the [decision log](../decisions.md)
- [ADR-002](../adr/ADR-002_toolchain.md) D2 (zod)
- Source read: OpenCode tag `v2.0.26` (`packages/core`, `server`, `schema`, `client`, `cli`); verified live against `opencode` 2.0.26
- [OpenCode Go docs](https://opencode.ai/docs/go), [OpenCode Terms](https://opencode.ai/legal/terms-of-service)

## Prerequisites

| Prerequisite                            | Status | Notes                                                                                                  |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| Scaffold                                | Done   | strict TS, vitest, CI                                                                                  |
| `opencode` 2.x installed and logged in  | Done   | 2.0.26 (Arch package)                                                                                  |
| Credit or quota for the live-test model | Open   | `opencode-go/deepseek-v4.1-flash` needs Global regions in the Go workspace Privacy settings (HTTP 400) |

## Breaking Changes

- [x] **No breaking changes** (new exports only; package is pre-alpha)

## Scope

### In Scope

- `Reviewer` interface, request/result/usage types, `ReviewerError` in the core.
- OpenCode adapter: server lifecycle, read-only reviewer agent, JSON output validated client-side with retries, usage mapping.
- Provisional findings schema (throwaway).
- Offline unit tests; live test gated by an env var.
- Findings on tokens, cost and retries, reported in the PR; roadmap updated.

### Out of Scope

- Findings schema and blocking rule — open question.
- Budget ledger — separate roadmap item; the "Budget units" decision is the user's, made from the findings here.
- Large diffs — open question; the diff is sent as-is.
- Configuration, CLI wiring, lenses, consolidator — later roadmap items.
- Other adapters (e.g. Claude Agent SDK) — the interface must allow them, none is built.
- OpenCode 1.x support.

## Technical Approach

The core defines a runner-neutral `Reviewer`. The core calls `review()` with a diff, instructions and a zod schema, and gets back validated output plus usage. The adapter owns everything OpenCode-specific; nothing from OpenCode leaks into `src/core`.

Facts that shape the design (S = from source v2.0.26, L = verified live on 2.0.26):

- **API:** 1.x routes (`/session`, `/config`, ...) are gone; 2.x serves `/api/...` behind Basic auth (`opencode:<password>`). SDK 1.19.0 cannot talk to it. (L)
- **No public client:** `@opencode/client` 2.x calls itself a "private generation target" and depends on `effect@4.0.0-rc` and other `@opencode/*` packages. `@opencode-ai/sdk` latest is 1.19.0. (S)
- **No structured output:** the prompt body is `text`, `files`, `agents`, `skills`, `metadata`, `delivery` and `resume`, with no `format`/JSON Schema. (S, L)
- **Server:** `opencode serve --stdio` prints `{"url":...}` and exits when stdin closes. It exited about 400 ms after its parent was SIGKILLed, so it can't leak. `OPENCODE_SERVER_PASSWORD` sets the password, `--port=0` picks a free port. (S, L)
- **Prompt is asynchronous:** `POST /api/session/:id/prompt` returns at once, and `POST /api/experimental/session/:id/wait` blocks until idle (the experimental route is the only wait). (L)
- **Permissions:** session `permissions` (sent on create) are evaluated after the agent's rules, and the last match wins. Wildcards match `/`. A deny is final: saved "always allow" rules and plugin hooks can't override it. Tools whose last rule for the action is a deny on `*` are hidden from the model. (S, L)
- **`grep` can read `.env`:** grep's permission resource is the search pattern, not the path. `grep path=".env"` returned the secret line while `read *.env` was denied. (L)
- **External directories:** paths outside the session directory need `external_directory`; a `*` deny blocks them. (S, L)
- **Agents and step cap:** agents come from config (`agents.<name>`: `system`, `mode`, `hidden`, `steps`, `permissions`). `steps` is per agent, so it's fixed per server. On the last step the model gets a max-steps prompt and no tool runs. (S, L)
- **Plugins:** there is no `OPENCODE_PURE`. Config `plugins: ["-*", "opencode.*"]` disables every non-built-in plugin. An external plugin's module is still imported but never set up. (S, L)
- **Config injection:** `OPENCODE_CONFIG_CONTENT` is merged last, above global and project config. (S, L)
- **Activation is lazy:** plugins (agents included) activate per location after the first request; agent lists were empty right after boot and filled about 3 s later. (L)
- **Usage:** each loop step is its own assistant message with `tokens` (input, output, reasoning, cache read/write) and `cost`. Session info carries the totals, which equalled the sum of its messages. Compaction and title calls are added to the session totals too. (S, L)
- **Cost:** computed by OpenCode from its model price catalog (`tokens × catalog price`), not reported by the provider. Free models report 0. (S, L)
- **Errors:** an assistant `error.type` of `provider.auth`, `provider.quota`, `provider.rate-limit`, `provider.timeout`, other `provider.*`, `aborted` or `unknown`. A quota error came back as `provider.quota`, HTTP 402. (S, L)
- **Server-side retries:** OpenCode retries retryable provider errors itself, up to 10 times (about 84 s of backoff, longer when the provider sends retry-after). (S)
- **Interrupt:** `POST /api/session/:id/interrupt` ends the run with `aborted`. The interrupted step records 0 tokens, so its partial usage is lost. (L)
- **Title:** a session created without a title triggers an extra model call to generate one. (S)
- **Delete:** `DELETE /api/session/:id` removes the session (a later GET returns 404). Sessions live in the user's OpenCode database. (L)

### Key Decisions

| Decision           | Chosen Option                                                                                                                                              | Rationale                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| OpenCode version   | 2.x only; `GET /api/info` major checked on connect                                                                                                         | Installed version; 1.x API is incompatible                                                             |
| Client             | Own narrow `fetch` port (about 9 calls) with zod-validated responses; no `@opencode/*` dependency                                                          | No public 2.x client; avoids `effect` RC; drift fails loudly                                           |
| Output typing      | Generic over a zod schema (`ReviewRequest<T>`)                                                                                                             | Findings schema is undecided; the consolidator needs a different shape                                 |
| Output transport   | JSON Schema in the prompt; JSON taken from the last assistant message's text (fences and surrounding prose tolerated) and validated with zod               | No structured output in 2.x; still typed JSON, not parsed Markdown                                     |
| Model identifier   | Opaque `provider/model` string interpreted by the adapter                                                                                                  | OpenCode's naming; other runners differ                                                                |
| Validation/retries | Retry only on missing or invalid output, in a new session with the previous output and the validation error (no diff), up to `maxAttempts` (default 2)     | Provider errors would fail again and the server already retries them; resending the diff is costly     |
| Read-only          | Session `permissions`: `"*": deny`; allow `read`, `glob`; deny `read` on `*.env`, `*.env.*`; allow `*.env.example`. `grep` denied                          | Deny by default, nothing falls back to `ask`; session rules apply on any agent; grep would leak `.env` |
| Step cap           | Dedicated hidden agent `spiral-reviewer` with `steps` from `maxSteps` (default 20, max 100)                                                                | Per-reviewer budget (README Budgets)                                                                   |
| Plugins            | `plugins: ["-*", "opencode.*"]` in `OPENCODE_CONFIG_CONTENT`                                                                                               | Prevents review recursion via our own OpenCode plugin and plugin hooks                                 |
| Server             | `opencode serve --stdio` on port 0 with a random password, started lazily (one shared start promise), reused across reviews, stopped by `close()`, unref'd | Parallel reviewers share one server; stdin ties its lifetime to ours                                   |
| Readiness          | Poll `GET /api/agent/spiral-reviewer?location[directory]=<cwd>` once per directory                                                                         | Agents load asynchronously per location                                                                |
| Usage              | Session totals (tokens, cost) per attempt; steps = assistant messages; summed over attempts                                                                | Includes every step and compaction                                                                     |
| Sessions           | Created with a title; deleted after each attempt, on success and on error                                                                                  | No extra title call; keeps reviewer sessions (with the diff) out of the user's OpenCode history        |
| Timeout/abort      | One deadline per review (`timeoutMs`, default 10 min) combined with the caller's signal; on expiry `interrupt`, collect usage, delete                      | Bounded by budget; server-side retries can take minutes                                                |
| Errors             | `ReviewerError` with `kind` (`auth`, `quota`, `rate-limit`, `provider`, `invalid-output`, `timeout`, `aborted`, `runner`) and usage so far                 | Core can fail open (R7) and still count spend                                                          |

### Risks & Trade-offs

| Risk/Trade-off                                                         | Impact | Mitigation                                                                                |
| ---------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| 2.x API is young; `wait` is experimental                               | High   | Responses validated with zod; major version checked; live test pins behavior              |
| No schema-constrained decoding; weaker models may answer in prose      | Medium | Client-side validation, retry without the diff                                            |
| External plugin modules are still imported (not set up)                | Low    | Top-level plugin code only; hooks and tools never register                                |
| Third-party provider-auth plugins are disabled                         | Medium | Documented; revisit if users need them                                                    |
| `cost` is an estimate from OpenCode's catalog                          | Medium | Not verified against a paid model yet (no credit); compare with the Zen/Go console        |
| Interrupted step's tokens are not recorded                             | Low    | Timeouts undercount by at most one step                                                   |
| Reviewer can read any non-`.env` file in the repo (e.g. other secrets) | Medium | Same exposure as sending the diff; README Constraints already says code goes to providers |
| Without `grep`, reviewers search with `glob` + `read` only             | Low    | Revisit if upstream adds path-based grep permissions                                      |
| Retries spend quota                                                    | Medium | `maxAttempts` default 2; retries without the diff; usage counted                          |

## Implementation

`review()`: ensure the server and the agent for `cwd` are ready. Then, per attempt: create a session (title, agent, model, `location.directory`, permissions), prompt with instructions, the JSON Schema and the diff as one text, wait, read the session totals and assistant messages, delete the session.

- The last assistant message has `error`: raise `ReviewerError` with the mapped kind, no retry.
- Output missing or invalid: retry in a new session with the previous output and the validation error, up to `maxAttempts`.
- Timeout and abort call `interrupt` and raise `ReviewerError` with the usage so far.
- Sessions are deleted in a `finally`.

### Files to Create

| File Path                                     | Purpose                                    |
| --------------------------------------------- | ------------------------------------------ |
| `src/core/reviewer.ts`                        | Reviewer interface, types, `ReviewerError` |
| `src/core/findings.ts`                        | Provisional findings schema                |
| `src/adapters/opencode/server.ts`             | `opencode serve --stdio` lifecycle         |
| `src/adapters/opencode/api.ts`                | Narrow HTTP port with validated responses  |
| `src/adapters/opencode/reviewer.ts`           | OpenCode adapter                           |
| `src/adapters/opencode/reviewer.test.ts`      | Offline tests with a fake port             |
| `src/adapters/opencode/reviewer.live.test.ts` | Live test, skipped unless `SPIRAL_LIVE=1`  |

### Files to Modify

| File Path           | Why                                                     |
| ------------------- | ------------------------------------------------------- |
| `src/index.ts`      | Export the reviewer API                                 |
| `docs/ROADMAP.md`   | Tick the item; record the findings under "Budget units" |
| `docs/decisions.md` | Record the deviation from ADR-001 D2                    |
| `README.md`         | One Development line on the live test                   |

## Testing Strategy

- Offline (fake port): server config (step cap, plugins), permission rules, JSON Schema and diff sent, valid output, retry on invalid then valid output (retry without the diff), exhausted retries, no retry on provider error, error-kind mapping, usage summed over steps and attempts, timeout and abort (interrupt, delete), agent readiness polling, one server start under concurrent reviews, version check, model id check.
- Live (`SPIRAL_LIVE=1`, `SPIRAL_LIVE_MODEL`, real `opencode`): review a fixture diff that needs a file read. Check, from the raw messages, that edit/write/shell/web/grep are unavailable or refused, that `.env` content never appears, and that nothing is written.

## Acceptance Criteria

- A reviewer produces zod-validated findings from a fixture diff through OpenCode (live test).
- The reviewer cannot edit, run shell commands, fetch the web or read `.env` (verified live).
- The PR reports what OpenCode exposes per message and how retries behave, each marked verified live or from source.
- No OpenCode types appear in `src/core`.
- `pnpm check` passes.
