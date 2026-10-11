# Roadmap

## Planned work

From [ADR-001](adr/ADR-001_general-design.md), in order; each item is a small PR.

- [ ] **Scaffold** (D1, D7): strict TypeScript, npm package `spiral-review` exporting a programmatic API, thin CLI with stubs for `init`, `review`, `hook`, `pr`, `stats`; lint, tests and CI for this repo.
- [ ] **OpenCode adapter** (D2): reviewer adapter interface; OpenCode via `@opencode-ai/sdk`, read-only (edit, bash, webfetch denied), findings as JSON-Schema-validated output. Record what the SDK reports per message (tokens, cost).
- [ ] **Configuration** (D6): defaults < `~/.config/spiral-review` < `.spiral-review.toml`; per-repo lens prompt overrides.
- [ ] **Claude Code Stop hook** (D3, D4): thin adapter over the core; `hook` reviews uncommitted diff incl. untracked files; returns `{"decision":"block","reason":...}`; diff-hash guard, round cap, fail-open, verify-don't-obey instructions. Needs the findings schema and blocking rule.
- [ ] **OpenCode plugin adapter** (D3, D4): spike first — verify a plugin can send findings into the active session on `session.idle`.
- [ ] **`pr`** (D5): digest comment via `gh`, `needs-human` label for high-risk. Needs digest format and risk tiers.
- [ ] **Single binary** (D1, optional): `bun build --compile`.

## Open questions

Undecided. Each one closes with an ADR or a [decision log](decisions.md) entry.

- **Risk tier thresholds:** diff size, sensitive paths, how tests weigh.
- **Tier scope:** the Stop hook reviews one turn's diff; a risky change split over small turns may stay "trivial". Compute the tier on the branch diff against its base?
- **Gauntlet placement:** fan-out plus consolidation takes minutes and blocks the session. Run it in the Stop hook, or only in `review`/`pr`?
- **Human approval:** the high-risk tier "requires explicit human approval" — before spending quota on the gauntlet, or before merge?
- **Findings schema and blocking rule** (severity × confidence).
- **Accept/reject protocol:** how the coding agent reports per-finding accepted/rejected/fixed by finding ID. Reviewer metrics depend on it.
- **Budget units:** subscriptions don't expose remaining quota; check whether the OpenCode SDK reports tokens or cost per message.
- **Ledger concurrency:** sessions in different repos may write the global ledger at the same time (file lock, SQLite?).
- **Degradation order** when a budget is exhausted.
- **Digest format.**
- **Shared quota:** with OpenCode for coding and reviewing, how the ledger accounts for coding usage so reviews don't starve it (or vice versa).
- **Same-model review:** enforce or warn when a reviewer uses the coding agent's model?
- **Loop guards:** combine Claude Code's `stop_hook_active` input with the per-session round cap?
- **OpenCode Go terms:** whether automated use is allowed (relevant before any CI).
