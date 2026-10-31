# Handover

Updated: 2026-10-31, after PRs #15–#17 (source-control guide; roadmap: user-level config, Codex)

## Where we are

Scaffold, OpenCode reviewer adapter, findings core and configuration are done. `src/core/config.ts` loads `.spiral-review.toml` over defaults and the instructions file (`REVIEW.md` by default). No CLI command uses them yet. Roadmap direction since: user-level config before `init` (R13, R14), and Codex as reviewer adapter and integration after the MVP.

## Prove it

Run: `pnpm install && pnpm check && pnpm build`
Expect: typecheck, lint and format check clean; `Tests  86 passed | 2 skipped` (the 2 are opt-in live tests); build emits `dist/`.

## Active chunk

None.

## Next action

Roadmap MVP item **Risk tier classifier** (rules from the [decision log](decisions.md)); thresholds, extra sensitive globs and skip globs come from `Config`; `.spiral-review.toml` and `LoadedConfig.instructionsPath` are sensitive paths.

## Decisions not to reopen

- General design, toolchain: [ADR-001](adr/ADR-001_general-design.md), [ADR-002](adr/ADR-002_toolchain.md).
- Findings schema, blocking rule, no verification step (with its revisit trigger), `dismiss`, large diffs: [ADR-003](adr/ADR-003_findings-and-review-policy.md).
- Risk tier rules, digest format, hook invocation, instructions file, `nit_cap` 5, `init` asks for the reviewer model: [decision log](decisions.md).
- Lockfiles stay high-risk and stay out of the reviewer diff (PR #10).
- Finding IDs exclude line and wording; collisions are accepted (ADR-003).

## Open questions

- **Repo-level config** (roadmap): if decided as leaning, the `[review]` table moves to user-level config. Don't build new code on `review.model` in `.spiral-review.toml`; the classifier is unaffected.
- See [roadmap open questions](ROADMAP.md#open-questions).
