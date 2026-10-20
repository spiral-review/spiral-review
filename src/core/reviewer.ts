// Runner-neutral reviewer contract (ADR-001 D2). Adapters own everything runner-specific.
import type { z } from "zod";

export interface ReviewRequest<T> {
  /** Unified diff under review; sent as-is. */
  readonly diff: string;
  /** Reviewer focus prompt (lens). */
  readonly instructions: string;
  /** Output contract; the adapter validates the reviewer's answer against it. */
  readonly schema: z.ZodType<T>;
  /** Opaque model identifier, interpreted by the adapter. */
  readonly model: string;
  /** Repository root the reviewer may read. */
  readonly cwd: string;
  readonly signal?: AbortSignal;
}

export interface Tokens {
  readonly input: number;
  readonly output: number;
  readonly reasoning: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

export interface Usage {
  readonly tokens: Tokens;
  /** Runner-estimated cost in USD, not provider-reported. */
  readonly cost: number;
  /** Model calls across all attempts. */
  readonly steps: number;
  readonly attempts: number;
}

export interface ReviewResult<T> {
  readonly output: T;
  readonly usage: Usage;
}

export type ReviewerErrorKind =
  | "auth"
  | "quota"
  | "rate-limit"
  | "provider"
  | "invalid-output"
  | "timeout"
  | "aborted"
  | "runner";

/** Carries usage so far so callers can fail open (R7) and still count spend. */
export class ReviewerError extends Error {
  override readonly name = "ReviewerError";

  constructor(
    readonly kind: ReviewerErrorKind,
    message: string,
    readonly usage: Usage,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export interface Reviewer {
  review<T>(request: ReviewRequest<T>): Promise<ReviewResult<T>>;
  close(): Promise<void>;
}

export const emptyUsage: Usage = {
  tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
  cost: 0,
  steps: 0,
  attempts: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    tokens: {
      input: a.tokens.input + b.tokens.input,
      output: a.tokens.output + b.tokens.output,
      reasoning: a.tokens.reasoning + b.tokens.reasoning,
      cacheRead: a.tokens.cacheRead + b.tokens.cacheRead,
      cacheWrite: a.tokens.cacheWrite + b.tokens.cacheWrite,
    },
    cost: a.cost + b.cost,
    steps: a.steps + b.steps,
    attempts: a.attempts + b.attempts,
  };
}
