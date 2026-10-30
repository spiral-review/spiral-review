# Handover

Updated: 2026-10-30, after [plan 002](plans/002_configuration.md) (configuration)

## Where we are

Scaffold, OpenCode reviewer adapter, findings core and configuration are done. `src/core/config.ts` loads `.spiral-review.toml` over defaults and the instructions file (`REVIEW.md` by default). No CLI command uses them yet.

## Prove it

Run: `pnpm install && pnpm check && pnpm build`
Expect: typecheck, lint and format check clean; `Tests  85 passed | 2 skipped` (the 2 are opt-in live tests); build emits `dist/`.

## Active chunk

None.

## Next action

Roadmap MVP item **Risk tier classifier** (rules from the [decision log](decisions.md)); thresholds, extra sensitive globs and skip globs come from `Config`; `.spiral-review.toml` and `LoadedConfig.instructionsPath` are sensitive paths.

## Decisions not to reopen

- General design, toolchain: [ADR-001](adr/ADR-001_general-design.md), [ADR-002](adr/ADR-002_toolchain.md).
- Findings schema, blocking rule, no verification step (with its revisit trigger), `dismiss`, large diffs: [ADR-003](adr/ADR-003_findings-and-review-policy.md).
- Risk tier rules, digest format, hook invocation, instructions file: [decision log](decisions.md).
- Lockfiles stay high-risk and stay out of the reviewer diff (PR #10).
- Finding IDs exclude line and wording; collisions are accepted (ADR-003).

## Open questions

- Default reviewer model: `review.model` has no default, so "works with defaults" fails until one is set. Pick one (e.g. a free OpenCode model) or have `init` ask.
- `nit_cap` default 5 is an agent choice (decision log, `Made By: agent`).
- Everything else: [roadmap open questions](ROADMAP.md#open-questions).
