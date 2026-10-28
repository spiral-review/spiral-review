# Handover

Updated: 2026-10-27, after PR #10 (MVP decisions) and #11 (agent execution guidance)

## Where we are

Scaffold and OpenCode reviewer adapter are merged. The MVP's "Decide first" questions are decided ([ADR-003](adr/ADR-003_findings-and-review-policy.md), [decision log](decisions.md)), and `src/core/findings.ts` implements the findings schema, IDs, citation and blocking rule. No MVP item is implemented yet.

## Prove it

Run: `pnpm install && pnpm check && pnpm build`
Expect: typecheck, lint and format check clean; `Tests  64 passed | 2 skipped` (the 2 are opt-in live tests); build emits `dist/`.

## Active chunk

None.

## Next action

Roadmap MVP item **Configuration**: built-in defaults < `.spiral-review.toml` plus the per-repo instructions file; no user-level config yet. Propose the instructions file name and location to the owner before coding.

## Decisions not to reopen

- General design, toolchain: [ADR-001](adr/ADR-001_general-design.md), [ADR-002](adr/ADR-002_toolchain.md).
- Findings schema, blocking rule, no verification step (with its revisit trigger), `dismiss`, large diffs: [ADR-003](adr/ADR-003_findings-and-review-policy.md).
- Risk tier rules, digest format, hook invocation: [decision log](decisions.md).
- Lockfiles stay high-risk and stay out of the reviewer diff (PR #10).
- Finding IDs exclude line and wording; collisions are accepted (ADR-003).

## Open questions

- Instructions file name and location (e.g. `REVIEW.md` vs `.spiral-review/instructions.md`).
- Everything else: [roadmap open questions](ROADMAP.md#open-questions).
