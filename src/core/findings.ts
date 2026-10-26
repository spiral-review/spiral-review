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
] as const;
export type Category = (typeof categories)[number];

/** One finding as the reviewer reports it (ADR-003 D1). */
export const reviewerFindingSchema = z.object({
  /** Repo-relative path. */
  file: z.string().min(1),
  /** Post-change line. */
  line: z.number().int().positive(),
  /** Exact code at or near `line`, 1–3 lines: the evidence. */
  quote: z.string().min(1),
  category: z.enum(categories),
  /** Names the bug class so every instance gets fixed. */
  title: z.string().min(1),
  body: z.string().min(1),
  /** Concrete input or state leading to a wrong outcome. */
  failureScenario: z.string().optional(),
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
  decisions: z.array(decisionSchema),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export interface Finding extends ReviewerFinding {
  readonly id: string;
  /** `quote` found in the post-change file or the diff. */
  readonly cited: boolean;
  readonly blocking: boolean;
}

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

/** Diff content lines without their `+`/`-`/space prefix. */
function diffCode(diff: string): string {
  return diff
    .split("\n")
    .filter(
      (l) =>
        /^[+\- ]/.test(l) && !/^(\+\+\+|---) (a\/|b\/|\/dev\/null)/.test(l),
    )
    .map((l) => l.slice(1))
    .join("\n");
}

export function isCited(
  quote: string,
  fileText: string | undefined,
  diff: string,
): boolean {
  const q = normalize(quote);
  if (q === "") return false;
  return (
    (fileText !== undefined && normalize(fileText).includes(q)) ||
    normalize(diffCode(diff)).includes(q)
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
 * `readFile` returns the post-change text of a repo-relative path, or undefined if absent.
 */
export function resolveFindings(
  findings: readonly ReviewerFinding[],
  diff: string,
  readFile: (file: string) => string | undefined,
): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of findings) {
    const id = findingId(f.file, f.category, f.quote);
    const cited = isCited(f.quote, readFile(f.file), diff);
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
