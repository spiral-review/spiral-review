# 002: Configuration

## Overview

Load per-repo settings from `.spiral-review.toml` over built-in defaults, and the instructions file (free text added to every reviewer prompt). Later MVP items (gates, tiers, `review`, digest) read their settings from here. MVP scope: no user-level config.

## References

- [ADR-001 D6](../adr/ADR-001_general-design.md), [ADR-002 D3](../adr/ADR-002_toolchain.md) (smol-toml), [ADR-003 D6](../adr/ADR-003_findings-and-review-policy.md) (`max_diff_bytes`)
- [Decision log](../decisions.md): risk tier thresholds, instructions file

## Technical Approach

`src/core/config.ts`: a strict zod schema over the parsed TOML (snake_case keys, as in ADR-003), mapped to a camelCase `Config`. `loadConfig(root)` reads both files; every problem is a `ConfigError` naming the file and key. Fail-open (R7) is the caller's job.

```toml
instructions = "REVIEW.md"   # repo-relative; default REVIEW.md, optional unless set
gates = ["pnpm check"]       # shell commands run before any LLM review; default none
skip = ["generated/**"]      # globs dropped from the review and from tier size counts

[review]
model = "provider/model"     # no default yet
max_diff_bytes = 100000
nit_cap = 5                  # nits listed in the digest; the rest are counted

[tiers]
max_lines = 500
max_files = 20
sensitive = ["billing/**"]   # added to the built-in sensitive paths
```

### Key Decisions

| Decision                | Chosen Option                                         | Rationale                                                              |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Instructions file       | `REVIEW.md` at repo root, overridable (owner)         | Same file as Anthropic's convention; `.spiral-review/` is gitignored   |
| Missing instructions    | Silent when defaulted, error when set explicitly      | A typo in the path must not silently drop the instructions             |
| Unknown keys            | Error                                                 | A misspelled key would otherwise do nothing                            |
| Instructions path scope | Repo-relative, resolved through symlinks, inside repo | Same rule as findings: nothing outside the repo is read                |
| `nit_cap` default       | 5                                                     | Keeps the digest one screen; agent choice, owner reviews               |
| Sensitive paths         | `.spiral-review.toml` and the instructions file       | Review config; the classifier (next item) must treat both as high-risk |

## Implementation

| File                            | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `src/core/config.ts` (new)      | Schema, `parseConfig`, `loadConfig`, `ConfigError` |
| `src/core/config.test.ts` (new) | Tests                                              |
| `src/index.ts`                  | Export                                             |

## Testing Strategy

Unit tests: defaults with no file; full file; unknown key, wrong type, bad model and TOML syntax errors name the key or line; default instructions missing → empty; explicit instructions missing → error; absolute, `..` and symlink-escaping instructions paths rejected.

## Acceptance Criteria

Each is covered by `src/core/config.test.ts`:

- No config file and no `REVIEW.md`: built-in defaults and empty instructions.
- Every setting in the example above is read; keys a table leaves out keep their defaults.
- `REVIEW.md` is read by default; `instructions` points to another file, and a missing explicit file is an error.
- Unknown keys, wrong types, out-of-range numbers and a model not in `provider/model` form raise `ConfigError` naming the key; TOML syntax errors name the line; an unreadable config file raises `ConfigError`.
- Absolute, `..` and symlinked instructions paths outside the repo are rejected; symlinks inside the repo are followed.
- All tests passing.

## Execution

Gate: `pnpm check && pnpm build`

- [x] C01 — `loadConfig` returns validated settings and instructions text, or a `ConfigError` naming the problem
      Accept: `pnpm vitest run src/core/config.test.ts`
