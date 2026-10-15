// OpenCode 2.x reviewer adapter (ADR-001 D2, plan 001).
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

export interface OpencodeReviewerOptions {
  /** Model calls per attempt (agent `steps`); the last one cannot use tools. */
  readonly maxSteps?: number;
  /** Attempts per review; only missing or invalid output is retried. */
  readonly maxAttempts?: number;
  /** Whole review, all attempts. */
  readonly timeoutMs?: number;
  /** Server start plus agent readiness. */
  readonly startTimeoutMs?: number;
}

export interface Connection {
  readonly api: OpencodeApi;
  close(): Promise<void>;
}

export type Connect = (
  config: object,
  timeoutMs: number,
) => Promise<Connection>;

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

const connectHttp: Connect = async (config, timeoutMs) => {
  const server = await startServer({ config, timeoutMs });
  return {
    api: createHttpApi(server.url, server.authorization),
    close: () => server.stop(),
  };
};

export function createOpencodeReviewer(
  options: OpencodeReviewerOptions = {},
  connect: Connect = connectHttp,
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

  let connection: Promise<Connection> | undefined;
  const ready = new Map<string, Promise<void>>();

  const connected = (): Promise<Connection> => {
    connection ??= (async () => {
      const conn = await connect(serverConfig(maxSteps), startTimeoutMs);
      const version = await conn.api.version();
      if (Number.parseInt(version, 10) !== SUPPORTED_MAJOR) {
        await conn.close();
        throw new Error(
          `OpenCode ${String(SUPPORTED_MAJOR)}.x required, found ${version}`,
        );
      }
      return conn;
    })();
    connection.catch(() => {
      connection = undefined;
    });
    return connection;
  };

  // Plugins (agents included) activate asynchronously per location after the first request.
  const agentReady = (api: OpencodeApi, directory: string): Promise<void> => {
    let promise = ready.get(directory);
    if (!promise) {
      promise = (async () => {
        const deadline = Date.now() + startTimeoutMs;
        while (!(await api.hasAgent(AGENT, directory))) {
          if (Date.now() > deadline)
            throw new Error(`agent ${AGENT} not loaded for ${directory}`);
          await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
        }
      })();
      promise.catch(() => ready.delete(directory));
      ready.set(directory, promise);
    }
    return promise;
  };

  return {
    async review<T>(request: ReviewRequest<T>) {
      const signal = request.signal
        ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);
      const model = parseModel(request.model);
      let api: OpencodeApi;
      try {
        api = (await connected()).api;
        await agentReady(api, request.cwd);
      } catch (error) {
        throw new ReviewerError("runner", messageOf(error), emptyUsage, {
          cause: error,
        });
      }

      const jsonSchema = JSON.stringify(z.toJSONSchema(request.schema));
      let usage = emptyUsage;
      let text = firstPrompt(request, jsonSchema);
      let invalid = "";
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal.aborted) abortError(signal, usage);
        const result = await runAttempt(
          api,
          { model, directory: request.cwd, text, signal },
          usage,
        );
        usage = result.usage;
        const parsed = parseOutput(result.output, request.schema);
        if (parsed.success) return { output: parsed.data, usage };
        invalid = parsed.error;
        text = retryPrompt(result.output, parsed.error, jsonSchema);
      }
      throw new ReviewerError(
        "invalid-output",
        `no valid output after ${String(maxAttempts)} attempts: ${invalid}`,
        usage,
      );
    },
    async close() {
      const pending = connection;
      connection = undefined;
      ready.clear();
      if (pending) await (await pending.catch(() => undefined))?.close();
    },
  };
}

interface Attempt {
  readonly model: { providerID: string; id: string };
  readonly directory: string;
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
      permissions: PERMISSIONS,
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

function parseModel(model: string): { providerID: string; id: string } {
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

export function parseOutput<T>(
  output: string,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(output)?.[1];
  const candidate = (fenced ?? output).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end < start)
    return { success: false, error: "no JSON object in the answer" };
  let json: unknown;
  try {
    json = JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    return { success: false, error: `invalid JSON: ${messageOf(error)}` };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, error: z.prettifyError(parsed.error) };
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
