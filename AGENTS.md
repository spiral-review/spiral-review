All agents MUST be **extremely succinct** when creating documentation — no unneeded docs unless explicitly asked.
All agents MUST be honest — find the best solution, don't try to please.

Documentation guidelines: `/docs/documentation/README.md`

## Gate

`pnpm check && pnpm build` (typecheck, lint, format check, tests, build); CI runs the same. Live reviewer tests are opt-in: `SPIRAL_LIVE=1 pnpm test` (needs `opencode` 2.x logged in). No runnable app yet; the CLI is `node dist/bin.js` after a build.

## Domain words

- coding agent: Claude Code or OpenCode writing the code. Avoid: author, assistant.
- reviewer: one model run behind the `Reviewer` adapter. Avoid: judge, critic.
- lens: a reviewer's focus prompt. Avoid: persona, role.
- finding: one problem a reviewer reports; blocking per ADR-003 D3. Avoid: issue, comment.
- decision (reviewer output): a change needing a human call, not a fix. Avoid: question.
- dismiss: the coding agent rejecting a finding with a reason. Avoid: ignore, waive.
- tier: trivial / standard / high-risk. Avoid: level, priority.
- gauntlet: the high-risk review (lenses plus consolidator). Avoid: deep review.
- gates: lint, types and tests spiral-review runs in the reviewed repo before any LLM review. Not this repo's gate. Avoid: checks.
- round: one blocking review and the coding agent's response; capped per session. Avoid: iteration.
- digest: the single spiral-review PR comment. Avoid: summary, report.
- integration: the per-coding-agent hooks or plugin calling the core. Avoid: plugin (that is the packaging).
- round guards: the per-session limits on rounds (unchanged-diff skip, round cap). Avoid: loop guards.
- classification: a diff's kind, loop, tier and needs-human, with reasons. Avoid: label, score.
- kind: docs, code or mixed, from paths. Avoid: type, category (findings have categories).
- loop: the development-process loop of a change (strategy, feature, execution), from paths. Avoid: stage, phase; the review cycle is a round.
- escalator: a command or function that may only raise a classification. Avoid: classifier, check, hook.
- merge policy: the owner's opt-in rules for merging a PR without a human. Avoid: auto-merge rule, merge gate (gates are lint, types, tests).
