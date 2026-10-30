import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseConfig } from "./config.js";

const defaults = {
  gates: [],
  skip: [],
  review: { maxDiffBytes: 100_000, nitCap: 5 },
  tiers: { maxLines: 500, maxFiles: 20, sensitive: [] },
};

describe("parseConfig", () => {
  it("uses built-in defaults for an empty file", () => {
    expect(parseConfig("")).toStrictEqual(defaults);
  });

  it("reads every setting", () => {
    const config = parseConfig(`
instructions = "docs/review.md"
gates = ["pnpm lint", "pnpm test"]
skip = ["generated/**"]

[review]
model = "opencode/deepseek-v4.1-flash"
max_diff_bytes = 50_000
nit_cap = 0

[tiers]
max_lines = 300
max_files = 10
sensitive = ["billing/**"]
`);
    expect(config).toStrictEqual({
      instructions: "docs/review.md",
      gates: ["pnpm lint", "pnpm test"],
      skip: ["generated/**"],
      review: {
        model: "opencode/deepseek-v4.1-flash",
        maxDiffBytes: 50_000,
        nitCap: 0,
      },
      tiers: { maxLines: 300, maxFiles: 10, sensitive: ["billing/**"] },
    });
  });

  it("keeps defaults for keys a table leaves out", () => {
    expect(parseConfig("[tiers]\nmax_files = 5").tiers).toStrictEqual({
      maxLines: 500,
      maxFiles: 5,
      sensitive: [],
    });
  });

  it.each([
    ["unknown key", "gate = []", /\(root\): .*gate/],
    ["unknown nested key", "[review]\nnitcap = 1", /review: .*nitcap/],
    ["wrong type", 'gates = "pnpm check"', /gates: /],
    ["empty gate", 'gates = [" "]', /gates\.0: /],
    ["non-integer", "[review]\nnit_cap = 1.5", /review\.nit_cap: /],
    ["negative", "[tiers]\nmax_lines = -1", /tiers\.max_lines: /],
    ["model without provider", '[review]\nmodel = "gpt"', /provider\/model/],
    [
      "absolute instructions",
      'instructions = "/etc/passwd"',
      /inside the repo/,
    ],
    ["escaping instructions", 'instructions = "../x.md"', /inside the repo/],
    [
      "TOML syntax",
      "gates = []\nskip = [",
      /\.spiral-review\.toml: [^]*^2: {2}skip/m,
    ],
  ])("rejects %s", (_name, text, message) => {
    const run = () => parseConfig(text);
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(message);
  });
});

describe("loadConfig", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "spiral-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("works with no files", async () => {
    expect(await loadConfig(root)).toStrictEqual({
      config: defaults,
      instructionsPath: "REVIEW.md",
      instructions: "",
    });
  });

  it("reads REVIEW.md by default", async () => {
    await writeFile(join(root, "REVIEW.md"), "Flag missing tenant checks.\n");
    const loaded = await loadConfig(root);
    expect(loaded.instructions).toBe("Flag missing tenant checks.\n");
  });

  it("reads the configured instructions file", async () => {
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs/review.md"), "Custom.");
    await writeFile(join(root, "REVIEW.md"), "Default.");
    await writeFile(
      join(root, ".spiral-review.toml"),
      'instructions = "docs/review.md"\ngates = ["pnpm check"]',
    );
    const loaded = await loadConfig(root);
    expect(loaded.instructionsPath).toBe("docs/review.md");
    expect(loaded.instructions).toBe("Custom.");
    expect(loaded.config.gates).toStrictEqual(["pnpm check"]);
  });

  it("rejects a configured instructions file that is missing", async () => {
    await writeFile(
      join(root, ".spiral-review.toml"),
      'instructions = "REVIEW.md"',
    );
    await expect(loadConfig(root)).rejects.toThrow(
      /instructions file REVIEW\.md: .*ENOENT/,
    );
  });

  it("rejects an instructions file that is a directory", async () => {
    await mkdir(join(root, "REVIEW.md"));
    await expect(loadConfig(root)).rejects.toThrow(ConfigError);
  });

  it("rejects instructions symlinked outside the repo", async () => {
    const outside = await mkdtemp(join(tmpdir(), "spiral-outside-"));
    try {
      await writeFile(join(outside, "secret.md"), "secret");
      await symlink(join(outside, "secret.md"), join(root, "REVIEW.md"));
      await expect(loadConfig(root)).rejects.toThrow(/outside the repo/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("follows symlinks that stay inside the repo", async () => {
    await writeFile(join(root, "AGENTS.md"), "Shared.");
    await symlink("AGENTS.md", join(root, "REVIEW.md"));
    expect((await loadConfig(root)).instructions).toBe("Shared.");
  });

  it("reports an unreadable config file as ConfigError", async () => {
    await mkdir(join(root, ".spiral-review.toml"));
    await expect(loadConfig(root)).rejects.toThrow(
      /\.spiral-review\.toml: .*EISDIR/,
    );
  });

  it("reports invalid config as ConfigError", async () => {
    await writeFile(join(root, ".spiral-review.toml"), "nit_cap = 3");
    await expect(loadConfig(root)).rejects.toThrow(ConfigError);
  });
});
