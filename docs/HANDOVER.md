# Handover

Updated: 2026-11-03, PR #19 (PRD-001 change classification, grilled)

## Where we are

Scaffold, OpenCode reviewer adapter, findings core and configuration are done. `src/core/config.ts` loads `.spiral-review.toml` over defaults and the instructions file (`REVIEW.md` by default). No CLI command uses them yet. Roadmap direction since: user-level config before `init` (R13, R14), and Codex as reviewer adapter and integration after the MVP. [PRD-001](prd/001_review-classification.md) replaces the risk tier classifier with a change classifier (kind, loop, tier, `needs-human`); escalators and the merge policy are post-MVP.

## Prove it

Run: `pnpm install && pnpm check && pnpm build`
Expect: typecheck, lint and format check clean; `Tests  86 passed | 2 skipped` (the 2 are opt-in live tests); build emits `dist/`.

## Active chunk

None.

## Next action

1. Merge PR #19 (PRD-001).
2. Draft and grill PRD-002 (prompt below).
3. Plan for the MVP **Change classifier** (PRD-001, MVP scope); thresholds, extra sensitive globs and skip globs come from `Config`; `.spiral-review.toml` and `LoadedConfig.instructionsPath` are sensitive paths; check the built-in sensitive globs cover `.claude/**`, `.opencode/**`, `.codex/**`.

### PRD-002 creation prompt

After PRD-001 merges, in a fresh session:

> Draft PRD-002 `docs/prd/002_docs-review.md` (docs review), then `/grill` it. Read first: AGENTS.md, docs/documentation/README.md and prd_template.md, [PRD-001](prd/001_review-classification.md) (kind/loop classification and routing: docs never go to the code reviewer; mixed PRs get both reviews, one verdict, one digest; docs coverage apart from ADR-003 D6), ADR-003 (findings schema, blocking rule), src/core/findings.ts. Settle: docs lenses per loop (strategy, feature, execution); finding categories for docs (contradiction with an ADR or decision, edit to a merged immutable doc, untestable AC, missing error path, avoided domain word) and whether they extend ADR-003 D1 (new ADR?); what a "failure scenario" means for a doc under D3; deterministic docs checks before any LLM (merged PRD/plan/ADR edited outside `## Amendments`, broken relative links, avoided domain words); per-turn hook vs `pr` only for docs (R4); how it is scored with reviewer evals.

## Decisions not to reopen

- General design, toolchain: [ADR-001](adr/ADR-001_general-design.md), [ADR-002](adr/ADR-002_toolchain.md).
- Findings schema, blocking rule, no verification step (with its revisit trigger), `dismiss`, large diffs: [ADR-003](adr/ADR-003_findings-and-review-policy.md).
- PRD-001: kind, loop and tier axes, loop globs, routing, escalator protocol direction, statuses, merge policy direction; sandboxing out of scope.
- Risk tier rules, digest format, hook invocation, instructions file, `nit_cap` 5, `init` asks for the reviewer model: [decision log](decisions.md).
- Lockfiles stay high-risk and stay out of the reviewer diff (PR #10).
- Finding IDs exclude line and wording; collisions are accepted (ADR-003).

## Open questions

- **Repo-level config** (roadmap): if decided as leaning, the `[review]` table moves to user-level config. Don't build new code on `review.model` in `.spiral-review.toml`; the classifier is unaffected.
- See [roadmap open questions](ROADMAP.md#open-questions).
