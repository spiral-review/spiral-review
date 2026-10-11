# ADR-002 - Toolchain

| **Creation Date** | **Status** |
| :---------------: | :--------: |
|    2026-10-10     |  Accepted  |

## Table of Contents

1. [Context](#context)
2. [Decision](#decision)
3. [Alternatives considered](#alternatives)
4. [Consequences and Risks](#consequences)

<a id="context"></a>

## Context

[ADR-001](ADR-001_general-design.md) sets TypeScript (strict) and npm distribution but no libraries. Choices are based on what widely used TypeScript/JS CLIs ship today (surveyed 2026-10-10 from their `package.json`; a sample, not a census):

| Concern     | Library           | Used by                                                                                                   |
| ----------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| Arg parsing | yargs             | Gemini CLI, Wrangler, Angular CLI, Nx, AWS CDK, Jest                                                      |
|             | commander         | Firebase CLI, Netlify CLI, shadcn, drizzle-kit, Open Code Review, Heroku                                  |
|             | cac / arg         | Vite, Vitest, Changesets / Vercel CLI, Expo                                                               |
|             | oclif             | Shopify CLI, Heroku                                                                                       |
| Schema      | zod               | Gemini CLI, Wrangler, Firebase, Vercel, Angular, Shopify, Astro, Expo, shadcn, drizzle-kit, OpenCode core |
| TOML        | smol-toml         | Wrangler, Vercel, Nx, Astro, Prettier                                                                     |
|             | @iarna/toml       | Gemini CLI, Shopify CLI                                                                                   |
| Tests       | vitest            | Gemini CLI, Wrangler, Netlify, Vercel, Shopify, Astro, Supabase, drizzle-kit, Open Code Review            |
|             | jest              | AWS CDK, Prettier                                                                                         |
| Lint/format | eslint + prettier | most of the above; none surveyed uses biome                                                               |

<a id="decision"></a>

## Decision

- **D1 - Arg parsing:** `commander` with `@commander-js/extra-typings`. Zero dependencies, typed, enough for five subcommands.
- **D2 - Schema:** `zod` (v4). One definition gives runtime validation, TypeScript types and JSON Schema (`z.toJSONSchema`) for OpenCode structured output.
- **D3 - TOML:** `smol-toml`.
- **D4 - Tests:** `vitest`.
- **D5 - Lint/format:** `eslint` (typescript-eslint) + `prettier`.
- **D6 - Package manager:** `pnpm`. The project's Node.js version is pinned with `devEngines.runtime` in `package.json`; pnpm installs it automatically.

Not decided here: bundler, terminal UI.

<a id="alternatives"></a>

## Alternatives considered

- **yargs (D1):** equally common, used by Gemini CLI. Extras over commander: built-in shell completion, automatic env-var mapping (`.env()`); we need neither. Six dependencies; its i18n (y18n) reads locale files from disk, which has broken `bun build --compile` binaries ([kilocode#14357](https://github.com/Kilo-Org/kilocode/issues/14357)).
- **oclif (D1):** plugin framework, too heavy for five commands.
- **valibot / TypeBox (D2):** smaller ecosystem in CLIs surveyed.
- **@iarna/toml (D3):** older, still used but less common in recent CLIs.
- **jest (D4):** used mainly by older projects.
- **biome (D5):** one fast tool instead of two, but not used by any CLI surveyed.
- **npm (D6):** ships with Node, but has no built-in Node version management.

<a id="consequences"></a>

## Consequences and Risks

- All choices are cheap to reverse; swapping one supersedes only the relevant decision here.
- pnpm is for development only; users still run the published package with `npx spiral-review` or any package manager.
- Compatibility with `bun build --compile` (ADR-001 D1) is expected for pure-JS libraries but unverified.
