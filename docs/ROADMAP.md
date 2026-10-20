# Roadmap

## North star: developer experience

The target flow. Requirements below are binding for design; numbers and thresholds are decided separately.

```mermaid
flowchart LR
    S[init<br/>once per machine] --> C[Code with the agent]
    C -- each turn --> H[Stop hook<br/>gates + standard review]
    H -- blocking --> C
    H -- ok --> C
    C -- "ship it" --> P[pr --create<br/>full review on branch diff]
    P -- blocking --> C
    P -- clear --> G[PR opened<br/>digest + label]
    G --> D[Human decides<br/>merge / ask for changes]
    D -- changes --> C
```

1. **Set up once.** `spiral-review init` checks prerequisites (OpenCode, `gh`, auth) and installs the coding-agent integration: the per-turn review, the ship procedure and the `gh pr create` guard (R12). Works with defaults; repo config is optional.
2. **Code.** You only talk to the agent. After each turn the integration runs gates and, if the change is not trivial, a standard review of the uncommitted changes. Blocking findings go to the agent, which fixes or rejects them with reasons. You see one status line, nothing more.
3. **Ship.** You tell the agent to ship (or type `/ship`); the installed ship procedure makes it run `spiral-review pr --create`. That reviews the whole branch against its base at the tier of the branch diff (gauntlet if high-risk).
   - Blocking findings: no PR is opened; the command prints them, saves them to `.spiral-review/`, exits non-zero. The agent fixes and reruns.
   - Clear, or round cap reached: pushes the branch, opens the PR, posts the digest, adds `needs-human` when high-risk, when human decisions are listed, or when findings are unresolved (R10). Unresolved findings are listed in the digest, never hidden.
4. **Decide.** You read one screen on the PR: what changed, tier, open findings, rejected findings with reasons, changes needing your decision. You merge or ask the agent for changes.
5. **Iterate.** New pushes: `spiral-review pr` updates the same digest comment, reusing cached results when the diff is unchanged.

### Requirements

- **R1 - No new habits:** day to day you use only the agent and the PR page; `pr --create` replaces `gh pr create`.
- **R2 - Findings never need a human relay:** they reach the coding agent through the integration or through command output it reads.
- **R3 - Quiet when fine:** a passing review is one status line.
- **R4 - Fast inner loop:** the per-turn hook runs only gates and the standard tier; the gauntlet runs only in `pr --create` / `review`.
- **R5 - Agent-runnable commands:** machine-readable output, non-zero exit on blocking findings, results saved under `.spiral-review/` (gitignored).
- **R6 - Bounded:** round caps end every loop; after the cap, the decision moves to the human via the digest.
- **R7 - Never fail closed:** reviewer errors, timeouts and budget degradation are reported in one line and in the digest; work is never blocked by spiral-review failing.
- **R8 - No double spend:** results are cached by diff hash; re-running on an unchanged diff costs no quota.
- **R9 - One digest per PR,** updated in place.
- **R10 - Humans own every merge:** high-risk changes get the full review within budget without asking first. `needs-human` is added when the PR is high-risk, lists changes needing a human decision, or has unresolved findings (R6). It means "read the digest carefully", not "only these need a human". No auto-merge (see [Out of scope](#out-of-scope)).
- **R11 - Same flow on every coding agent** (Claude Code, OpenCode).
- **R12 - Agent behavior is installed, not instructed:** the user never writes prompts or rules to make the agent follow this flow. `init` installs, per coding agent:
  - **Ship procedure:** run `spiral-review pr --create`; on non-zero exit, read the findings, fix or reject each with a reason, rerun; when the PR opens, report link and tier.
  - **Guard:** a pre-tool hook blocks `gh pr create` (and equivalents) and points the agent to `spiral-review pr --create`. Deterministic: works even if the agent ignores the procedure.
  - **Per-turn review:** the Stop hook (Claude Code) or `session.idle` plugin (OpenCode).

  |                 | Claude Code                | OpenCode                                                 |
  | --------------- | -------------------------- | -------------------------------------------------------- |
  | Packaging       | one plugin (skill + hooks) | one plugin (+ command)                                   |
  | Ship procedure  | skill `ship`, also `/ship` | custom command or `AGENTS.md` (skill support unverified) |
  | Guard           | `PreToolUse` hook          | `tool.execute.before`                                    |
  | Per-turn review | `Stop` hook                | `session.idle` event (spike)                             |

  The plugins only call the CLI; logic stays in the core (ADR-001 D7).

## Planned work

In order; each item is a small PR. D-numbers refer to [ADR-001](adr/ADR-001_general-design.md). "Needs" lists open questions to decide first.

- [x] **Scaffold** (D1, D7): strict TypeScript, npm package `spiral-review` exporting a programmatic API, thin CLI with stubs for `init`, `review`, `hook`, `pr`, `stats`; lint, tests and CI for this repo.
- [x] **OpenCode adapter** (D2): reviewer adapter interface; OpenCode 2.x via its HTTP API, read-only on a best-effort basis (only `read` and `glob`, `.env` and symlinks denied), findings as zod-validated JSON ([plan 001](plans/001_opencode-adapter.md)).
- [ ] **MVP** · **Configuration** (D6): defaults < `~/.config/spiral-review` < `.spiral-review.toml`; per-repo lens prompt overrides; a per-repo review instructions file (what failure looks like, nit cap, paths to skip, file and line evidence required, summary that starts with the finding count), like Anthropic's `REVIEW.md` ([source][anthropic-review]).
- [ ] **MVP** · **Deterministic gates:** run the repo's lint, type check and tests before any LLM review; commands come from config.
- [ ] **MVP** · **Risk tier classifier:** trivial / standard / high-risk from the diff. Deterministic rules set the minimum tier; optional escalators (e.g. a learned classifier) run after them and can only raise it, each with a reason shown in the digest. Needs: risk tier thresholds.
- [ ] **MVP** · **`review`, standard tier:** one reviewer, one round, findings and verdict from the core. Needs: findings schema and blocking rule; large diffs.
- [ ] **Gauntlet and consolidator:** lens fan-out, optionally on different models; consolidator merges, verifies, drops false positives. Needs: findings schema.
- [ ] **MVP** · **Claude Code Stop hook** (D3, D4): thin adapter over the core; `hook` reviews uncommitted diff incl. untracked files; returns `{"decision":"block","reason":...}`; diff-hash guard, round cap, fail-open, verify-don't-obey instructions. Needs the findings schema and blocking rule.
- [ ] **MVP** · **`init`** (north star 1, R12): checks prerequisites (OpenCode, `gh`, auth, `spiral-review` on `PATH`), installs the coding-agent plugin (ship procedure, `gh pr create` guard, per-turn review). Needs: hook invocation.
- [ ] **OpenCode plugin adapter** (D3, D4): spike first — verify a plugin can send findings into the active session on `session.idle`.
- [ ] **Reviewer isolation:** OpenCode permissions are not a sandbox (its threat model), so the read-only reviewer is best effort. Give reviewers no file tools (the diff plus files the core sends), or run OpenCode in a container or OS sandbox. Needed before reviewing untrusted PRs.
- [ ] **MVP** · **`pr` and `pr --create`** (D5, north star 3–5): branch review, PR creation, digest comment updated in place, `needs-human` label, result cache. Needs digest format and risk tiers.
- [ ] **Budget ledger and degradation:** per-reviewer, per-task and global budgets; degrade instead of skipping. Needs: budget units, ledger concurrency, degradation order, shared quota.
- [ ] **`stats` and reviewer metrics:** accept/reject rates per lens and model. Needs: accept/reject protocol.
- [ ] **Reviewer evals:** a set of diffs with confirmed bugs (from past reverts and fixes); score every prompt, model or lens change against it before keeping it ([source][anthropic-review]). `stats` measures noise; this measures recall.
- [ ] **Single binary** (D1, optional): `bun build --compile`.

### MVP milestone

First usable version, used daily on this repo. Items marked **MVP** above, reduced to:

- configuration: built-in defaults and `.spiral-review.toml` only;
- risk tiers: rules only, no escalators; standard tier only (high-risk reviews like standard, plus `needs-human`);
- `init` and integration: Claude Code only;
- budgets: per-reviewer limits only (max steps, timeout; done in the adapter).

Decide first: findings schema and blocking rule, risk tier thresholds, digest format, hook invocation, large diffs. The rest waits until MVP use shows it pays off.

## Out of scope

Not planned now; to be re-evaluated later.

- **Auto-merge** (e.g. trivial PRs via GitHub auto-merge). Conflicts with "the human keeps the decisions". Re-evaluate once reviewer metrics show low-risk reviews are reliable and the risk classifier is proven; opt-in only.

## Later

Follow-ups with a known trigger.

- **TypeScript 7:** move from 6.0 once typescript-eslint supports it ([#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).
- **GitHub Action** wrapping the CLI (ADR-001 D5). Check OpenCode Go terms first.

## Open questions

Undecided. Each one closes with an ADR or a [decision log](decisions.md) entry.

- **Risk tier thresholds:** diff size, sensitive paths, how tests weigh.
- **Learned escalator:** e.g. TypeSafe's Jev (calibrated yes/no, label and score answers). Unverified: whether it runs locally (a hosted API sends the diff to another vendor and needs its own key), licensing for an npm CLI, accuracy (measure with reviewer evals first).
- **Hook invocation:** how the installed integration calls spiral-review. `npx`/`pnpm dlx` hit the registry on every turn and `npx` is missing when Node is installed by pnpm (v11+). Leaning: global install (`spiral-review` on `PATH`), checked by `init`.
- **Large diffs:** what to send when a diff exceeds the reviewer's practical size (the prototype truncates at `REVIEW_MAX_BYTES`): truncate and say so, split by file, or escalate to the human.
- **Findings schema and blocking rule** (severity × confidence). Leaning ([source][anthropic-review]):
  - a `pre-existing` flag for bugs the diff did not introduce: reported, never blocking (about 59% of repeat findings in Anthropic's runaway loop were older code);
  - nits never block and never reach the coding agent, only the digest: with an agent author every nit costs a round;
  - a finding names its bug class, so the agent fixes every instance.
- **Standard-tier noise:** one reviewer's findings reach the agent unverified, and each false positive costs a round. Add a cheap verification step, or block only on high severity?
- **Security pass:** a separate security review on the standard tier too (Anthropic runs one on every PR, and its findings block), or only the gauntlet's security lens?
- **Accept/reject protocol:** how the coding agent reports per-finding accepted/rejected/fixed by finding ID. Reviewer metrics depend on it. Leaning: four outcomes, fixed / wrong / intentional / doesn't matter ([source][anthropic-review]); "doesn't matter" marks noisy lenses.
- **Budget units:** subscriptions don't expose remaining quota. OpenCode 2.x reports per message, and as session totals, tokens (input, output, reasoning, cache read/write) and `cost` in USD. `cost` is OpenCode's estimate from its price catalog, not the provider's, and is 0 for free models ([plan 001](plans/001_opencode-adapter.md)). Not yet compared with the Zen/Go console.
- **Ledger concurrency:** sessions in different repos may write the global ledger at the same time (file lock, SQLite?).
- **Degradation order** when a budget is exhausted.
- **Digest format.**
- **Shared quota:** with OpenCode for coding and reviewing, how the ledger accounts for coding usage so reviews don't starve it (or vice versa).
- **Same-model review:** enforce or warn when a reviewer uses the coding agent's model?
- **Loop guards:** combine Claude Code's `stop_hook_active` input with the per-session round cap? Anthropic adds ([source][anthropic-review]): never repeat a finding already raised (needs stable finding IDs); after the first rounds, review only what changed since; at the cap, ask the author to reconsider the approach.
- **Outcome guardrail:** track reverts of reviewed changes, so fewer findings can't hide more escaped bugs (Anthropic's guardrail is revert and incident rates, [source][anthropic-review])?
- **OpenCode Go terms:** whether automated use is allowed (relevant before any CI).

[anthropic-review]: https://claude.dev/blog/solving-code-review-at-anthropic/
