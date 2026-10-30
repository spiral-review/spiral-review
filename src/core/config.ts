// Per-repo configuration (ADR-001 D6): built-in defaults < `.spiral-review.toml`, plus the instructions file.
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { parse, TomlError } from "smol-toml";
import { z } from "zod";
import { isRepoPath } from "./findings.js";

export const CONFIG_FILE = ".spiral-review.toml";
export const DEFAULT_INSTRUCTIONS = "REVIEW.md";

const repoPath = z
  .string()
  .min(1)
  .refine(isRepoPath, "must be a relative path inside the repo");
const glob = z.string().trim().min(1);

const fileSchema = z.strictObject({
  /** Instructions file, repo-relative; `DEFAULT_INSTRUCTIONS` when unset. */
  instructions: repoPath.optional(),
  /** Gate commands, run in order before any LLM review. */
  gates: z.array(z.string().trim().min(1)).default([]),
  /** Globs dropped from the review and from tier size counts. */
  skip: z.array(glob).default([]),
  review: z
    .strictObject({
      model: z
        .string()
        .regex(/^[^/\s]+\/\S+$/, 'must be "provider/model"')
        .optional(),
      max_diff_bytes: z.int().positive().default(100_000),
      /** Nits listed in the digest; the rest are only counted. */
      nit_cap: z.int().nonnegative().default(5),
    })
    .prefault({}),
  tiers: z
    .strictObject({
      max_lines: z.int().positive().default(500),
      max_files: z.int().positive().default(20),
      /** Globs added to the built-in sensitive paths. */
      sensitive: z.array(glob).default([]),
    })
    .prefault({}),
});

export interface Config {
  readonly instructions?: string;
  readonly gates: readonly string[];
  readonly skip: readonly string[];
  readonly review: {
    readonly model?: string;
    readonly maxDiffBytes: number;
    readonly nitCap: number;
  };
  readonly tiers: {
    readonly maxLines: number;
    readonly maxFiles: number;
    readonly sensitive: readonly string[];
  };
}

export interface LoadedConfig {
  readonly config: Config;
  /** Repo-relative path of the instructions file; review config, so a sensitive path. */
  readonly instructionsPath: string;
  /** Its text; empty when the default file is absent. */
  readonly instructions: string;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

/** Validates `.spiral-review.toml` text; throws `ConfigError`. */
export function parseConfig(text: string): Config {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    if (!(error instanceof TomlError)) throw error;
    throw new ConfigError(`${CONFIG_FILE}: ${error.message}`, {
      cause: error,
    });
  }
  const result = fileSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new ConfigError(`${CONFIG_FILE}: ${problems.join("; ")}`);
  }
  const { instructions, gates, skip, review, tiers } = result.data;
  return {
    ...(instructions === undefined ? {} : { instructions }),
    gates,
    skip,
    review: {
      ...(review.model === undefined ? {} : { model: review.model }),
      maxDiffBytes: review.max_diff_bytes,
      nitCap: review.nit_cap,
    },
    tiers: {
      maxLines: tiers.max_lines,
      maxFiles: tiers.max_files,
      sensitive: tiers.sensitive,
    },
  };
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

/** Reads the config and instructions file from the repo `root`; throws `ConfigError`. */
export async function loadConfig(root: string): Promise<LoadedConfig> {
  let text = "";
  try {
    text = await readFile(join(root, CONFIG_FILE), "utf8");
  } catch (error) {
    if (!isMissing(error)) {
      throw new ConfigError(`${CONFIG_FILE}: ${String(error)}`, {
        cause: error,
      });
    }
  }
  const config = parseConfig(text);
  const instructionsPath = config.instructions ?? DEFAULT_INSTRUCTIONS;
  return {
    config,
    instructionsPath,
    instructions: await readInstructions(
      root,
      instructionsPath,
      config.instructions !== undefined,
    ),
  };
}

async function readInstructions(
  root: string,
  file: string,
  required: boolean,
): Promise<string> {
  try {
    const real = await realpath(join(root, file));
    const rel = relative(await realpath(root), real);
    if (
      rel === "" ||
      rel === ".." ||
      rel.startsWith(`..${sep}`) ||
      isAbsolute(rel)
    ) {
      throw new ConfigError(`instructions file ${file} is outside the repo`);
    }
    return await readFile(real, "utf8");
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    if (!required && isMissing(error)) return "";
    throw new ConfigError(`instructions file ${file}: ${String(error)}`, {
      cause: error,
    });
  }
}
