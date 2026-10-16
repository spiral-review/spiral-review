// OpenCode checks `read` permissions on the lexical path relative to the session directory, so a symlink
// would get around the .env and external-directory rules. Deny reading through every symlink git can see
// (tracked or untracked, not ignored) in the worktree.
import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import type { PermissionRule } from "./api.js";

const run = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, {
    cwd,
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
}

export async function symlinkRules(cwd: string): Promise<PermissionRule[]> {
  const top = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  const list = async (args: string[]) =>
    (await git(top, ["ls-files", "-z", ...args])).split("\0").filter(Boolean);
  const tracked = (await list(["-s"]))
    .filter((entry) => entry.startsWith("120000 "))
    .map((entry) => entry.slice(entry.indexOf("\t") + 1));
  const untracked = await list(["-o", "--exclude-standard"]);
  const links = await Promise.all(
    untracked.map(async (file) =>
      (await lstat(join(top, file)).catch(() => undefined))?.isSymbolicLink()
        ? file
        : undefined,
    ),
  );
  return [...tracked, ...links.filter((file) => file !== undefined)].flatMap(
    (file) => {
      const resource = relative(cwd, join(top, file)).split(sep).join("/");
      return [
        { action: "read", resource, effect: "deny" },
        { action: "read", resource: `${resource}/*`, effect: "deny" },
      ];
    },
  );
}
