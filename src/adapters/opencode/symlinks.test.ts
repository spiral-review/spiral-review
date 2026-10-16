import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { symlinkRules } from "./symlinks.js";

const repo = realpathSync(mkdtempSync(join(tmpdir(), "spiral-links-")));
afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("symlinkRules", () => {
  it("denies reads through tracked and untracked symlinks, not ignored ones", async () => {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
    git("init", "-q");
    mkdirSync(join(repo, "sub"));
    writeFileSync(join(repo, ".env"), "SECRET=1\n");
    writeFileSync(join(repo, ".gitignore"), "ignored-link\n");
    symlinkSync(".env", join(repo, "tracked-link"));
    symlinkSync("/etc", join(repo, "sub/outside"));
    symlinkSync(".env", join(repo, "ignored-link"));
    git("add", "tracked-link", ".gitignore");

    const rules = await symlinkRules(repo);
    const denied = rules.map((r) => r.resource).sort();

    expect(rules.every((r) => r.action === "read" && r.effect === "deny")).toBe(
      true,
    );
    expect(denied).toEqual([
      "sub/outside",
      "sub/outside/*",
      "tracked-link",
      "tracked-link/*",
    ]);
    expect(
      (await symlinkRules(join(repo, "sub"))).map((r) => r.resource),
    ).toContain("outside");
  });
});
