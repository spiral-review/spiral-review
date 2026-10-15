// Provisional findings schema for the adapter spike. The real schema and blocking rule are an open question (ROADMAP).
import { z } from "zod";

export const findingsSchema = z.object({
  findings: z.array(
    z.object({
      file: z.string(),
      line: z.number().int().nonnegative(),
      severity: z.enum(["blocker", "major", "minor"]),
      message: z.string(),
    }),
  ),
});

export type Findings = z.infer<typeof findingsSchema>;
