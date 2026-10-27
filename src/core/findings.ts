// Findings schema, IDs and blocking rule (ADR-003).
import { createHash } from "node:crypto";
import { z } from "zod";

export const severities = ["critical", "major", "minor", "nit"] as const;
export type Severity = (typeof severities)[number];

export const categories = [
  "correctness",
  "security",
  "error-handling",
  "concurrency",
  "data-integrity",
  "resource",
  "api-contract",
  "performance",
  "tests",
  "maintainability",
  "other",
] as const;
export type Category = (typeof categories)[number];

/** One finding as the reviewer reports it (ADR-003 D1). */
export const reviewerFindingSchema = z.object({
  /** Repo-relative path; the old path for a deleted file. */
  file: z.string().min(1),
  /** Post-change line; 0 when there is none (removed code, deleted file). */
  line: z.number().int().nonnegative(),
  /** Exact code at or near `line`, 1–3 lines: the evidence. */
  quote: z.string().min(1),
  category: z.enum(categories),
  /** Names the bug class so every instance gets fixed. */
  title: z.string().min(1),
  body: z.string().min(1),
  /** Concrete input or state leading to a wrong outcome. */
  failureScenario: z.string().nullish(),
  severity: z.enum(severities),
  confidence: z.enum(["high", "medium", "low"]),
  /** The diff did not introduce it. */
  preExisting: z.boolean(),
});
export type ReviewerFinding = z.infer<typeof reviewerFindingSchema>;

/** A change needing a human call, not a fix: digest only, adds `needs-human`. */
export const decisionSchema = z.object({
  title: z.string().min(1),
  why: z.string().min(1),
  file: z.string().min(1).optional(),
  line: z.number().int().positive().optional(),
});
export type Decision = z.infer<typeof decisionSchema>;

/** Reviewer output contract (ADR-003 D1). */
export const reviewOutputSchema = z.object({
  findings: z.array(reviewerFindingSchema),
  decisions: z.array(decisionSchema).default([]),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export interface Finding extends ReviewerFinding {
  readonly id: string;
  /** `quote` found in the finding's own file: its post-change text or its removed lines in the diff. */
  readonly cited: boolean;
  readonly blocking: boolean;
}

/** Shorter quotes are too generic to count as evidence. */
export const MIN_QUOTE_LENGTH = 8;

function normalize(code: string): string {
  return code.replace(/\s+/g, " ").trim();
}

/** Ignores line and wording, so the ID survives shifts and rephrasing (ADR-003 D2). */
export function findingId(
  file: string,
  category: Category,
  quote: string,
): string {
  const hash = createHash("sha256")
    .update(`${file}\0${category}\0${normalize(quote)}`)
    .digest("hex");
  return `F-${hash.slice(0, 6)}`;
}

/** Relative, inside the repo: never read anything else on a reviewer's say-so. */
export function isRepoPath(file: string): boolean {
  return (
    !/^([/\\]|[A-Za-z]:)/.test(file) &&
    !file.includes("\0") &&
    !file.split(/[/\\]/).includes("..")
  );
}

const escapes: Record<string, number> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

/** A `---`/`+++` path: git's C-style quoting, trailing tab, `a/`/`b/` prefix. */
function headerPath(raw: string, prefix: string): string | undefined {
  let path: string;
  if (raw.startsWith('"')) {
    const bytes: number[] = [];
    let i = 1;
    for (; i < raw.length && raw[i] !== '"'; i++) {
      const c = raw[i] ?? "";
      if (c !== "\\") {
        bytes.push(...Buffer.from(c));
        continue;
      }
      const octal = /^[0-7]{3}/.exec(raw.slice(i + 1));
      if (octal) {
        bytes.push(parseInt(octal[0], 8));
        i += 3;
      } else {
        const e = raw[++i] ?? "";
        bytes.push(escapes[e] ?? e.charCodeAt(0));
      }
    }
    path = Buffer.from(bytes).toString("utf8");
  } else {
    path = raw.replace(/\t.*$/, "");
  }
  if (path === "/dev/null") return undefined;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Old-side code (context and removed lines) per file, one string per hunk so a quote cannot span hunks.
 * Expects a git diff with `a/`/`b/` prefixes (`--src-prefix=a/ --dst-prefix=b/` overrides user config).
 */
export function oldSideHunks(diff: string): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  let paths: string[] = [];
  let oldPath: string | undefined;
  let hunk: string[] | undefined;
  const flush = () => {
    if (!hunk) return;
    for (const p of paths) {
      const list = byFile.get(p) ?? [];
      list.push(hunk.join("\n"));
      byFile.set(p, list);
    }
    hunk = undefined;
  };
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      paths = [];
      oldPath = undefined;
    } else if (line.startsWith("@@")) {
      flush();
      hunk = [];
    } else if (hunk) {
      if (line.startsWith("-") || line.startsWith(" "))
        hunk.push(line.slice(1));
    } else if (line.startsWith("--- ")) {
      oldPath = headerPath(line.slice(4), "a/");
      if (oldPath !== undefined) paths = [oldPath];
    } else if (line.startsWith("+++ ")) {
      const newPath = headerPath(line.slice(4), "b/");
      paths = [
        ...new Set(
          [oldPath, newPath].filter((p): p is string => p !== undefined),
        ),
      ];
    }
  }
  flush();
  return byFile;
}

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /\w/.test(c);
}

/** Substring match that does not cut through identifiers. */
function containsTokens(text: string, quote: string): boolean {
  const wordStart = isWordChar(quote[0]);
  const wordEnd = isWordChar(quote[quote.length - 1]);
  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) {
    if (wordStart && isWordChar(text[i - 1])) continue;
    if (wordEnd && isWordChar(text[i + quote.length])) continue;
    return true;
  }
  return false;
}

/** `fileText` and `oldHunks` belong to the finding's own file. */
export function isCited(
  quote: string,
  fileText: string | undefined,
  oldHunks: readonly string[],
): boolean {
  const q = normalize(quote);
  if (q.length < MIN_QUOTE_LENGTH) return false;
  return [...(fileText === undefined ? [] : [fileText]), ...oldHunks].some(
    (text) => containsTokens(normalize(text), q),
  );
}

/** ADR-003 D3. */
export function isBlocking(finding: ReviewerFinding, cited: boolean): boolean {
  if (finding.preExisting || !cited) return false;
  if (!finding.failureScenario?.trim()) return false;
  switch (finding.severity) {
    case "critical":
      return finding.confidence !== "low";
    case "major":
      return finding.confidence === "high";
    default:
      return false;
  }
}

function rank(f: Finding): number {
  return (f.blocking ? 0 : severities.length) + severities.indexOf(f.severity);
}

/**
 * Adds ID, citation and blocking; merges findings with the same ID, keeping a blocking one, then the most severe.
 * `diff` as for `oldSideHunks`. `readFile` returns the post-change text of a repo-relative path (resolved inside
 * the repo root), or undefined if absent; it is called at most once per file, and never for paths outside the repo.
 */
export function resolveFindings(
  findings: readonly ReviewerFinding[],
  diff: string,
  readFile: (file: string) => string | undefined,
): Finding[] {
  const hunks = oldSideHunks(diff);
  const files = new Map<string, string | undefined>();
  const read = (file: string) => {
    if (!files.has(file)) files.set(file, readFile(file));
    return files.get(file);
  };
  const byId = new Map<string, Finding>();
  for (const f of findings) {
    const id = findingId(f.file, f.category, f.quote);
    const cited =
      isRepoPath(f.file) &&
      isCited(f.quote, read(f.file), hunks.get(f.file) ?? []);
    const resolved: Finding = {
      ...f,
      id,
      cited,
      blocking: isBlocking(f, cited),
    };
    const seen = byId.get(id);
    if (!seen || rank(resolved) < rank(seen)) byId.set(id, resolved);
  }
  return [...byId.values()];
}
