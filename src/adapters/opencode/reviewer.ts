// OpenCode 2.x reviewer adapter (ADR-001 D2, plan 001).
import { realpath } from "node:fs/promises";
import { z } from "zod";
import {
  addUsage,
  emptyUsage,
  ReviewerError,
  type ReviewerErrorKind,
  type Reviewer,
  type ReviewRequest,
  type Usage,
} from "../../core/reviewer.js";
import { createHttpApi, type OpencodeApi, type PermissionRule } from "./api.js";
import { startServer } from "./server.js";
import { symlinkRules } from "./symlinks.js";

export interface OpencodeReviewerOptions {
  /** Model calls per attempt (agent `steps`); the last one cannot use tools. */
  readonly maxSteps?: number;
  /** Attempts per review; only missing or invalid output is retried. */
  readonly maxAttempts?: number;
  /** Whole review including startup; cleanup after the deadline adds at most a few short requests. */
  readonly timeoutMs?: number;
  /** Server start, and separately agent readiness per directory. */
  readonly startTimeoutMs?: number;
}

export interface Connection {
  readonly api: OpencodeApi;
  /** Resolves when the server goes away. */
  readonly exited: Promise<void>;
  close(): Promise<void>;
}

export type Connect = (
  config: object,
  timeoutMs: number,
  signal: AbortSignal,
) => Promise<Connection>;

/** Symlink rules for a directory; injectable for tests. */
export type ExtraRules = (cwd: string) => Promise<PermissionRule[]>;

export const AGENT = "spiral-reviewer";
export const SUPPORTED_MAJOR = 2;

/**
 * Session rules are evaluated after the agent's; the last match wins. `grep` stays denied: its permission
 * resource is the pattern, not the path, so it could read `.env` files.
 */
export const PERMISSIONS: readonly PermissionRule[] = [
  { action: "*", resource: "*", effect: "deny" },
  { action: "read", resource: "*", effect: "allow" },
  { action: "glob", resource: "*", effect: "allow" },
  { action: "read", resource: "*.env", effect: "deny" },
  { action: "read", resource: "*.env.*", effect: "deny" },
  { action: "read", resource: "*.env.example", effect: "allow" },
];

const SYSTEM =
  "You are a code reviewer. You only read; you never modify anything.";
const READY_POLL_MS = 100;

export function serverConfig(maxSteps: number): object {
  return {
    // Built-in plugins only: no external plugin hooks, no review recursion through our own plugin.
    plugins: ["-*", "opencode.*"],
    agents: {
      [AGENT]: {
        mode: "primary",
        hidden: true,
        steps: maxSteps,
        system: SYSTEM,
      },
    },
  };
}

const connectHttp: Connect = async (config, timeoutMs, signal) => {
  const server = await startServer({ config, timeoutMs, signal });
  return {
    api: createHttpApi(server.url, server.authorization),
    exited: server.exited,
    close: () => server.stop(),
  };
};

// Plugins (agents included) activate asynchronously per location after the first request.
export async function waitForAgent(
  api: OpencodeApi,
  directory: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await api.hasAgent(AGENT, directory))) {
    if (Date.now() > deadline) {
      throw new Error(
        `agent ${AGENT} not loaded for ${directory} within ${String(timeoutMs)}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
}

interface Live {
  readonly conn: Connection;
  /** Agent readiness per directory, valid for this server only. */
  readonly ready: Map<string, Promise<void>>;
}

export function createOpencodeReviewer(
  options: OpencodeReviewerOptions = {},
  connect: Connect = connectHttp,
  extraRules: ExtraRules = symlinkRules,
): Reviewer {
  const maxSteps = options.maxSteps ?? 20;
  const maxAttempts = options.maxAttempts ?? 2;
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const startTimeoutMs = options.startTimeoutMs ?? 30_000;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100) {
    throw new RangeError("maxSteps must be an integer in 1..100");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  let current: { live: Promise<Live>; stop: AbortController } | undefined;

  const connected = (): Promise<Live> => {
    if (current) return current.live;
    const stop = new AbortController();
    const live = (async () => {
      const conn = await connect(
        serverConfig(maxSteps),
        startTimeoutMs,
        stop.signal,
      );
      const version = await conn.api.version().catch(async (error: unknown) => {
        await conn.close();
        throw error;
      });
      if (Number.parseInt(version, 10) !== SUPPORTED_MAJOR) {
        await conn.close();
        throw new Error(
          `OpenCode ${String(SUPPORTED_MAJOR)}.x required, found ${version}`,
        );
      }
      return { conn, ready: new Map<string, Promise<void>>() };
    })();
    const entry = { live, stop };
    current = entry;
    const forget = () => {
      if (current === entry) current = undefined;
    };
    // A dead server must not poison later reviews.
    live.then((l) => l.conn.exited.then(forget), forget);
    return live;
  };

  const agentReady = (live: Live, directory: string): Promise<void> => {
    let promise = live.ready.get(directory);
    if (!promise) {
      const p = waitForAgent(live.conn.api, directory, startTimeoutMs);
      p.catch(() => {
        if (live.ready.get(directory) === p) live.ready.delete(directory);
      });
      live.ready.set(directory, p);
      promise = p;
    }
    return promise;
  };

  return {
    async review<T>(request: ReviewRequest<T>) {
      const signal = request.signal
        ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);
      const model = parseModel(request.model);
      let jsonSchema: string;
      try {
        jsonSchema = JSON.stringify(z.toJSONSchema(request.schema));
      } catch (error) {
        throw new ReviewerError(
          "runner",
          `schema cannot be expressed as JSON Schema: ${messageOf(error)}`,
          emptyUsage,
          { cause: error },
        );
      }

      let api: OpencodeApi;
      let directory: string;
      let permissions: PermissionRule[];
      try {
        directory = await realpath(request.cwd);
        const [live, rules] = await untilAborted(
          Promise.all([connected(), extraRules(directory)]),
          signal,
        );
        await untilAborted(agentReady(live, directory), signal);
        api = live.conn.api;
        permissions = [...PERMISSIONS, ...rules];
      } catch (error) {
        if (signal.aborted) abortError(signal, emptyUsage);
        throw new ReviewerError("runner", messageOf(error), emptyUsage, {
          cause: error,
        });
      }

      const first = firstPrompt(request, jsonSchema);
      let usage = emptyUsage;
      let text = first;
      let invalid = "";
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal.aborted) abortError(signal, usage);
        const result = await runAttempt(
          api,
          { model, directory, permissions, text, signal },
          usage,
        );
        usage = result.usage;
        const parsed = parseOutput(result.output, request.schema);
        if (parsed.success) return { output: parsed.data, usage };
        invalid = parsed.error;
        // Without JSON there is nothing to reformat: asking for one would invent a review.
        text =
          parsed.reason === "missing"
            ? first
            : retryPrompt(result.output, parsed.error, jsonSchema);
      }
      throw new ReviewerError(
        "invalid-output",
        `no valid output after ${String(maxAttempts)} attempts: ${invalid}`,
        usage,
      );
    },
    async close() {
      const entry = current;
      current = undefined;
      if (!entry) return;
      entry.stop.abort(new Error("reviewer closed"));
      await (await entry.live.catch(() => undefined))?.conn.close();
    },
  };
}

/** Rejects as soon as `signal` aborts; the shared work itself keeps running for other reviews. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort = () => undefined as unknown;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(signal.reason as Error);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([promise, aborted]).finally(() => {
    signal.removeEventListener("abort", onAbort);
  });
}

interface Attempt {
  readonly model: { providerID: string; id: string };
  readonly directory: string;
  readonly permissions: readonly PermissionRule[];
  readonly text: string;
  readonly signal: AbortSignal;
}

async function runAttempt(
  api: OpencodeApi,
  attempt: Attempt,
  before: Usage,
): Promise<{ output: string; usage: Usage }> {
  let usage = addUsage(before, { ...emptyUsage, attempts: 1 });
  const fail = (
    kind: ReviewerErrorKind,
    message: string,
    cause?: unknown,
  ): never => {
    throw new ReviewerError(kind, message, usage, { cause });
  };
  let sessionID: string;
  try {
    sessionID = await api.createSession({
      title: "spiral-review",
      agent: AGENT,
      model: attempt.model,
      directory: attempt.directory,
      permissions: attempt.permissions,
    });
  } catch (error) {
    return fail("runner", messageOf(error), error);
  }

  try {
    let interrupted = false;
    try {
      await api.prompt(sessionID, attempt.text);
      await api.wait(sessionID, attempt.signal);
    } catch (error) {
      if (!attempt.signal.aborted)
        return fail("runner", messageOf(error), error);
      interrupted = true;
      await api.interrupt(sessionID).catch(() => undefined);
    }

    const [info, messages] = await Promise.all([
      api.session(sessionID),
      api.assistantMessages(sessionID),
    ]).catch((error: unknown) => fail("runner", messageOf(error), error));
    usage = addUsage(usage, {
      tokens: {
        input: info.tokens.input,
        output: info.tokens.output,
        reasoning: info.tokens.reasoning,
        cacheRead: info.tokens.cache.read,
        cacheWrite: info.tokens.cache.write,
      },
      cost: info.cost,
      steps: messages.length,
      attempts: 0,
    });
    if (interrupted) abortError(attempt.signal, usage);

    const last = messages.at(-1);
    if (last?.error)
      return fail(errorKind(last.error.type), last.error.message);
    const output = (last?.content ?? [])
      .flatMap((part) =>
        part.type === "text" && part.text !== undefined ? [part.text] : [],
      )
      .join("\n");
    return { output, usage };
  } finally {
    await api.deleteSession(sessionID).catch(() => undefined);
  }
}

function abortError(signal: AbortSignal, usage: Usage): never {
  const timedOut =
    signal.reason instanceof DOMException &&
    signal.reason.name === "TimeoutError";
  throw new ReviewerError(
    timedOut ? "timeout" : "aborted",
    timedOut ? "review timed out" : "review aborted",
    usage,
    { cause: signal.reason },
  );
}

export function errorKind(type: string): ReviewerErrorKind {
  switch (type) {
    case "provider.auth":
      return "auth";
    case "provider.quota":
      return "quota";
    case "provider.rate-limit":
      return "rate-limit";
    case "provider.timeout":
      return "timeout";
    case "aborted":
      return "aborted";
    default:
      return type.startsWith("provider.") ? "provider" : "runner";
  }
}

export function parseModel(model: string): { providerID: string; id: string } {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    throw new ReviewerError(
      "runner",
      `model must be "provider/model", got "${model}"`,
      emptyUsage,
    );
  }
  return { providerID: model.slice(0, slash), id: model.slice(slash + 1) };
}

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; reason: "missing" | "invalid"; error: string };

export function parseOutput<T>(
  output: string,
  schema: z.ZodType<T>,
): ParseResult<T> {
  const trimmed = output.trim();
  // Bare JSON first: fences inside string values must not be mistaken for a wrapper.
  const candidates = [
    trimmed,
    ...Array.from(trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n?```/g), (m) =>
      (m[1] ?? "").trim(),
    ),
    trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1),
  ];
  // "invalid" only when the reviewer clearly answered in JSON; braces in prose count as missing.
  let firstError: string | undefined;
  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch (error) {
      if (candidate === trimmed)
        firstError ??= `invalid JSON: ${messageOf(error)}`;
      continue;
    }
    const parsed = schema.safeParse(json);
    if (parsed.success) return { success: true, data: parsed.data };
    firstError ??= z.prettifyError(parsed.error);
  }
  return firstError === undefined
    ? {
        success: false,
        reason: "missing",
        error: "no JSON object in the answer",
      }
    : { success: false, reason: "invalid", error: firstError };
}

function firstPrompt(
  request: ReviewRequest<unknown>,
  jsonSchema: string,
): string {
  return `${request.instructions}

Review the diff below. You may read repository files for context; you cannot modify anything.
Answer with ONLY a JSON object matching this JSON Schema, with no prose and no code fences:
${jsonSchema}

<diff>
${request.diff}
</diff>`;
}

function retryPrompt(
  previous: string,
  error: string,
  jsonSchema: string,
): string {
  return `A previous answer did not match the required JSON Schema.

Validation error:
${error}

Previous answer:
<answer>
${previous}
</answer>

Return ONLY the corrected JSON object matching this JSON Schema, with no prose and no code fences:
${jsonSchema}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
