import { describe, expect, it } from "vitest";
import {
  findingId,
  isBlocking,
  isCited,
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
  "--- a/src/ratio.ts",
  "+++ b/src/ratio.ts",
  "@@ -1,4 +1,3 @@",
  " export function ratio(a, b) {",
  "-  if (b === 0) throw new Error();",
  "   return a / b;",
].join("\n");

describe("reviewOutputSchema", () => {
  it("accepts a valid output", () => {
    const out = {
      findings: [base],
      decisions: [{ title: "Public API change", why: "ratio now returns NaN" }],
    };
    expect(reviewOutputSchema.parse(out)).toEqual(out);
  });

  it("rejects unknown categories, line 0 and missing fields", () => {
    const bad = [
      { ...base, category: "style" },
      { ...base, line: 0 },
      { ...base, quote: "" },
    ];
    for (const f of bad) {
      expect(
        reviewOutputSchema.safeParse({ findings: [f], decisions: [] }).success,
      ).toBe(false);
    }
    expect(reviewOutputSchema.safeParse({ findings: [] }).success).toBe(false);
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

describe("isCited", () => {
  it("finds the quote in the post-change file, whitespace-insensitive", () => {
    expect(isCited("return  a / b;", file, "")).toBe(true);
    expect(isCited("// TODO\n return a / b;", file, "")).toBe(true);
  });

  it("finds removed code in the diff", () => {
    expect(isCited("if (b === 0) throw new Error();", file, diff)).toBe(true);
  });

  it("rejects invented code, empty quotes and diff headers", () => {
    expect(isCited("return a * b;", file, diff)).toBe(false);
    expect(isCited("   ", file, diff)).toBe(false);
    expect(isCited("a/src/ratio.ts", undefined, diff)).toBe(false);
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
    expect(isBlocking({ ...critical, failureScenario: undefined }, true)).toBe(
      false,
    );
    expect(isBlocking({ ...critical, failureScenario: " " }, true)).toBe(false);
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
    const [f] = resolveFindings([{ ...base, quote: "nope()" }], diff, read);
    expect(f).toMatchObject({ cited: false, blocking: false });
  });

  it("merges same-ID findings, keeping a blocking one, then the most severe", () => {
    const minor = { ...base, severity: "minor", title: "first" } as const;
    const unproven = {
      ...base,
      severity: "critical",
      failureScenario: undefined,
    } as const;
    const out = resolveFindings(
      [minor, unproven, base, { ...base, line: 9, quote: "other" }],
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
