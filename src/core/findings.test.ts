import { describe, expect, it, vi } from "vitest";
import {
  findingId,
  isBlocking,
  isCited,
  isRepoPath,
  oldSideHunks,
  resolveFindings,
  reviewOutputSchema,
  type ReviewerFinding,
} from "./findings.js";

const base: ReviewerFinding = {
  file: "src/ratio.ts",
  line: 3,
  quote: "return a / b;",
  category: "correctness",
  title: "Division by zero unchecked",
  body: "b may be 0.",
  failureScenario: "ratio(1, 0) returns Infinity instead of throwing",
  severity: "major",
  confidence: "high",
  preExisting: false,
};

const file = "export function ratio(a, b) {\n  // TODO\n  return a / b;\n}\n";
const diff = [
  "diff --git a/src/ratio.ts b/src/ratio.ts",
  "index 1111111..2222222 100644",
  "--- a/src/ratio.ts",
  "+++ b/src/ratio.ts",
  "@@ -1,4 +1,4 @@",
  " export function ratio(a, b) {",
  "-  if (b === 0) throw new Error();",
  "+  // TODO",
  "   return a / b;",
  " }",
  "diff --git a/src/other.ts b/src/other.ts",
  "--- a/src/other.ts",
  "+++ b/src/other.ts",
  "@@ -1 +1 @@",
  "-const removedElsewhere = 1;",
  "+const added = 1;",
].join("\n");

describe("reviewOutputSchema", () => {
  it("accepts a valid output", () => {
    const out = {
      findings: [base],
      decisions: [{ title: "Public API change", why: "ratio now returns NaN" }],
    };
    expect(reviewOutputSchema.parse(out)).toEqual(out);
  });

  it("accepts null failureScenario, line 0, category other and missing decisions", () => {
    const f = { ...base, failureScenario: null, line: 0, category: "other" };
    expect(reviewOutputSchema.parse({ findings: [f] })).toEqual({
      findings: [f],
      decisions: [],
    });
  });

  it("rejects unknown categories, negative lines and empty quotes", () => {
    const bad = [
      { ...base, category: "style" },
      { ...base, line: -1 },
      { ...base, quote: "" },
    ];
    for (const f of bad) {
      expect(reviewOutputSchema.safeParse({ findings: [f] }).success).toBe(
        false,
      );
    }
  });
});

describe("findingId", () => {
  it("ignores whitespace in the quote", () => {
    const id = findingId("a.ts", "security", "x =  y;\n");
    expect(id).toMatch(/^F-[0-9a-f]{6}$/);
    expect(findingId("a.ts", "security", "  x = y;")).toBe(id);
  });

  it("depends on file, category and quote", () => {
    const id = findingId("a.ts", "security", "x");
    expect(findingId("b.ts", "security", "x")).not.toBe(id);
    expect(findingId("a.ts", "correctness", "x")).not.toBe(id);
    expect(findingId("a.ts", "security", "y")).not.toBe(id);
  });
});

describe("isRepoPath", () => {
  it.each([
    ["src/a.ts", true],
    ["a..b.ts", true],
    ["/etc/passwd", false],
    ["C:/x", false],
    ["\\\\host\\share", false],
    ["../secret", false],
    ["src/../../x", false],
    ["src\\..\\x", false],
  ])("%s → %s", (path, expected) => {
    expect(isRepoPath(path)).toBe(expected);
  });
});

describe("oldSideHunks", () => {
  it("keeps context and removed lines per file, per hunk", () => {
    const hunks = oldSideHunks(diff);
    expect(hunks.get("src/ratio.ts")).toEqual([
      "export function ratio(a, b) {\n  if (b === 0) throw new Error();\n  return a / b;\n}",
    ]);
    expect(hunks.get("src/other.ts")).toEqual(["const removedElsewhere = 1;"]);
  });

  it("keeps removed lines that look like headers", () => {
    const sql = [
      "diff --git a/q.sql b/q.sql",
      "--- a/q.sql",
      "+++ b/q.sql",
      "@@ -1,2 +1 @@",
      "--- a/legacy comment",
      "+++ b/not a header either",
      " select 1;",
    ].join("\n");
    expect(oldSideHunks(sql).get("q.sql")).toEqual([
      "-- a/legacy comment\nselect 1;",
    ]);
  });

  it("parses quoted paths, deleted files and renames", () => {
    const d = [
      'diff --git "a/\\303\\250 \\"q\\".ts" "b/\\303\\250 \\"q\\".ts"',
      '--- "a/\\303\\250 \\"q\\".ts"\t',
      '+++ "b/\\303\\250 \\"q\\".ts"\t',
      "@@ -1 +1 @@",
      "-old quoted",
      "diff --git a/gone.ts b/gone.ts",
      "deleted file mode 100644",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-old gone",
      "diff --git a/from.ts b/to.ts",
      "--- a/from.ts",
      "+++ b/to.ts",
      "@@ -1 +1 @@",
      "-old renamed",
    ].join("\n");
    const hunks = oldSideHunks(d);
    expect(hunks.get('è "q".ts')).toEqual(["old quoted"]);
    expect(hunks.get("gone.ts")).toEqual(["old gone"]);
    expect(hunks.get("to.ts")).toEqual(["old renamed"]);
    expect(hunks.get("from.ts")).toEqual(["old renamed"]);
  });

  it("keeps hunks separate", () => {
    const d = [
      "diff --git a/x.ts b/x.ts",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -1 +1 @@",
      "-first hunk end",
      "@@ -9 +9 @@",
      "-second hunk start",
    ].join("\n");
    expect(oldSideHunks(d).get("x.ts")).toEqual([
      "first hunk end",
      "second hunk start",
    ]);
  });
});

describe("isCited", () => {
  const hunks = oldSideHunks(diff).get("src/ratio.ts") ?? [];

  it("finds the quote in the post-change file, whitespace-insensitive", () => {
    expect(isCited("return  a / b;", file, [])).toBe(true);
    expect(isCited("// TODO\n return a / b;", file, [])).toBe(true);
  });

  it("finds removed code in the file's own hunks", () => {
    expect(isCited("if (b === 0) throw new Error();", file, hunks)).toBe(true);
  });

  it("rejects invented code, short quotes and partial tokens", () => {
    expect(isCited("return a * b;", file, hunks)).toBe(false);
    expect(isCited("a / b;", file, hunks)).toBe(false);
    expect(isCited("eturn a / b", file, hunks)).toBe(false);
    expect(isCited("return a / b", "xreturn a / bc", [])).toBe(false);
  });

  it("rejects quotes spanning hunks or mixing old and new lines", () => {
    expect(
      isCited("first hunk end second hunk start", undefined, [
        "first hunk end",
        "second hunk start",
      ]),
    ).toBe(false);
    expect(isCited("throw new Error(); // TODO", file, hunks)).toBe(false);
  });
});

describe("isBlocking", () => {
  it("blocks a cited major/high finding with a failure scenario", () => {
    expect(isBlocking(base, true)).toBe(true);
  });

  it.each([
    ["critical", "high", true],
    ["critical", "medium", true],
    ["critical", "low", false],
    ["major", "high", true],
    ["major", "medium", false],
    ["minor", "high", false],
    ["nit", "high", false],
  ] as const)("%s / %s → %s", (severity, confidence, expected) => {
    expect(isBlocking({ ...base, severity, confidence }, true)).toBe(expected);
  });

  it("never blocks pre-existing, uncited or scenario-less findings", () => {
    const critical = { ...base, severity: "critical" } as const;
    expect(isBlocking({ ...critical, preExisting: true }, true)).toBe(false);
    expect(isBlocking(critical, false)).toBe(false);
    for (const failureScenario of [undefined, null, " "]) {
      expect(isBlocking({ ...critical, failureScenario }, true)).toBe(false);
    }
  });
});

describe("resolveFindings", () => {
  const read = (f: string) => (f === base.file ? file : undefined);

  it("adds id, cited and blocking", () => {
    const [f] = resolveFindings([base], diff, read);
    expect(f).toMatchObject({
      id: findingId(base.file, base.category, base.quote),
      cited: true,
      blocking: true,
    });
  });

  it("does not block on a quote missing from file and diff", () => {
    const [f] = resolveFindings([{ ...base, quote: "nope(x, y)" }], diff, read);
    expect(f).toMatchObject({ cited: false, blocking: false });
  });

  it("does not cite code from another file's diff", () => {
    const [f] = resolveFindings(
      [{ ...base, quote: "const removedElsewhere = 1;" }],
      diff,
      read,
    );
    expect(f).toMatchObject({ cited: false, blocking: false });
  });

  it("never reads paths outside the repo", () => {
    const readFile = vi.fn(() => "return a / b;");
    const [f] = resolveFindings(
      [{ ...base, file: "../outside.ts" }],
      diff,
      readFile,
    );
    expect(readFile).not.toHaveBeenCalled();
    expect(f).toMatchObject({ cited: false, blocking: false });
  });

  it("reads each file once", () => {
    const readFile = vi.fn(read);
    resolveFindings(
      [base, { ...base, quote: "export function ratio(a, b) {" }],
      diff,
      readFile,
    );
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("merges same-ID findings, keeping a blocking one, then the most severe", () => {
    const minor = { ...base, severity: "minor", title: "first" } as const;
    const unproven = {
      ...base,
      severity: "critical",
      failureScenario: undefined,
    } as const;
    const out = resolveFindings(
      [minor, unproven, base, { ...base, line: 9, quote: "// TODO here" }],
      diff,
      read,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ severity: "major", blocking: true });
  });

  it("keeps the most severe among non-blocking duplicates", () => {
    const out = resolveFindings(
      [
        { ...base, severity: "nit" },
        { ...base, severity: "minor" },
      ],
      diff,
      read,
    );
    expect(out).toEqual([expect.objectContaining({ severity: "minor" })]);
  });
});
