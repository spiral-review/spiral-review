import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ReviewerError } from "../../core/reviewer.js";
import type {
  AssistantMessage,
  CreateSessionInput,
  OpencodeApi,
  SessionInfo,
} from "./api.js";
import {
  AGENT,
  createOpencodeReviewer,
  errorKind,
  parseOutput,
  PERMISSIONS,
  serverConfig,
  type Connect,
} from "./reviewer.js";

const schema = z.object({
  findings: z.array(z.object({ message: z.string() })),
});
const valid = '{"findings":[{"message":"divide by zero"}]}';

interface Turn {
  readonly messages: AssistantMessage[];
  readonly tokens?: number;
  readonly cost?: number;
  /** Never goes idle; only an abort ends the wait. */
  readonly hang?: boolean;
}

function assistant(
  text: string,
  error?: AssistantMessage["error"],
): AssistantMessage {
  return {
    type: "assistant",
    time: { created: 0 },
    content: [{ type: "text", text }],
    ...(error ? { error } : {}),
  };
}

function fake(turns: Turn[], version = "2.0.26", loadingPolls = 0) {
  const created: CreateSessionInput[] = [];
  const prompts: string[] = [];
  const deleted: string[] = [];
  const interrupted: string[] = [];
  const sessions = new Map<string, Turn>();
  let agentPolls = 0;
  const api: OpencodeApi = {
    version: () => Promise.resolve(version),
    hasAgent: () => Promise.resolve(++agentPolls > loadingPolls),
    createSession: (input) => {
      created.push(input);
      const id = `ses_${String(created.length)}`;
      const turn = turns.shift();
      if (!turn) throw new Error("unexpected session");
      sessions.set(id, turn);
      return Promise.resolve(id);
    },
    prompt: (_id, text) => {
      prompts.push(text);
      return Promise.resolve();
    },
    wait: (id, signal) =>
      sessions.get(id)?.hang
        ? new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(signal.reason as Error);
            });
          })
        : Promise.resolve(),
    interrupt: (id) => {
      interrupted.push(id);
      return Promise.resolve();
    },
    assistantMessages: (id) =>
      Promise.resolve(sessions.get(id)?.messages ?? []),
    session: (id): Promise<SessionInfo> => {
      const turn = sessions.get(id);
      const n = turn?.tokens ?? 0;
      return Promise.resolve({
        id,
        cost: turn?.cost ?? 0,
        tokens: {
          input: n,
          output: n,
          reasoning: 0,
          cache: { read: n, write: 0 },
        },
      });
    },
    deleteSession: (id) => {
      deleted.push(id);
      return Promise.resolve();
    },
  };
  const close = vi.fn(() => Promise.resolve());
  const connect = vi.fn<Connect>(() => Promise.resolve({ api, close }));
  return {
    connect,
    close,
    created,
    prompts,
    deleted,
    interrupted,
    agentPolls: () => agentPolls,
  };
}

const request = {
  diff: "diff --git a/x.ts b/x.ts\n+DIFF_MARKER",
  instructions: "Find bugs.",
  schema,
  model: "opencode-go/deepseek-v4.1-flash",
  cwd: "/repo",
};

describe("opencode reviewer", () => {
  it("returns validated output and creates a read-only session", async () => {
    const f = fake([
      {
        messages: [assistant("reading"), assistant(valid)],
        tokens: 10,
        cost: 0.5,
      },
    ]);
    const reviewer = createOpencodeReviewer({ maxSteps: 7 }, f.connect);

    const result = await reviewer.review(request);

    expect(result.output).toEqual({
      findings: [{ message: "divide by zero" }],
    });
    expect(result.usage).toEqual({
      tokens: {
        input: 10,
        output: 10,
        reasoning: 0,
        cacheRead: 10,
        cacheWrite: 0,
      },
      cost: 0.5,
      steps: 2,
      attempts: 1,
    });
    expect(f.connect).toHaveBeenCalledWith(serverConfig(7), 30_000);
    expect(f.created[0]).toEqual({
      title: "spiral-review",
      agent: AGENT,
      model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
      directory: "/repo",
      permissions: PERMISSIONS,
    });
    expect(f.prompts[0]).toContain("DIFF_MARKER");
    expect(f.prompts[0]).toContain(JSON.stringify(z.toJSONSchema(schema)));
    expect(f.deleted).toEqual(["ses_1"]);
  });

  it("configures a step-capped agent with only built-in plugins", () => {
    expect(serverConfig(5)).toMatchObject({
      plugins: ["-*", "opencode.*"],
      agents: { [AGENT]: { steps: 5, hidden: true } },
    });
  });

  it("denies everything except read and glob, and .env reads", () => {
    const last = (action: string, resource: string) =>
      PERMISSIONS.findLast(
        (r) =>
          new RegExp(`^${r.action.replaceAll("*", ".*")}$`).test(action) &&
          new RegExp(
            `^${r.resource.replaceAll(".", "\\.").replaceAll("*", ".*")}$`,
          ).test(resource),
      )?.effect;
    expect(last("read", "src/a.ts")).toBe("allow");
    expect(last("glob", "**/*.ts")).toBe("allow");
    expect(last("read", ".env")).toBe("deny");
    expect(last("read", "config/.env.local")).toBe("deny");
    expect(last("read", ".env.example")).toBe("allow");
    for (const action of [
      "edit",
      "shell",
      "webfetch",
      "websearch",
      "grep",
      "subagent",
      "execute",
    ]) {
      expect(last(action, "*")).toBe("deny");
    }
  });

  it("retries invalid output in a new session without the diff", async () => {
    const f = fake([
      { messages: [assistant("looks fine to me")], tokens: 1, cost: 0.1 },
      {
        messages: [assistant("```json\n" + valid + "\n```")],
        tokens: 2,
        cost: 0.2,
      },
    ]);
    const result = await createOpencodeReviewer({}, f.connect).review(request);

    expect(result.output.findings).toHaveLength(1);
    expect(result.usage.attempts).toBe(2);
    expect(result.usage.steps).toBe(2);
    expect(result.usage.cost).toBeCloseTo(0.3);
    expect(f.prompts[1]).not.toContain("DIFF_MARKER");
    expect(f.prompts[1]).toContain("looks fine to me");
    expect(f.prompts[1]).toContain("no JSON object");
    expect(f.deleted).toEqual(["ses_1", "ses_2"]);
  });

  it("fails with invalid-output after maxAttempts", async () => {
    const f = fake([
      { messages: [assistant('{"findings":"none"}')], tokens: 1 },
      { messages: [assistant("{}")], tokens: 1 },
    ]);
    const error = await createOpencodeReviewer({ maxAttempts: 2 }, f.connect)
      .review(request)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ReviewerError);
    expect(error).toMatchObject({
      kind: "invalid-output",
      usage: { attempts: 2, steps: 2 },
    });
  });

  it("does not retry provider errors and keeps usage", async () => {
    const f = fake([
      {
        messages: [
          assistant("", {
            type: "provider.quota",
            message: "Insufficient account funds",
          }),
        ],
        tokens: 3,
      },
    ]);
    const error = await createOpencodeReviewer({}, f.connect)
      .review(request)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      kind: "quota",
      usage: { attempts: 1, steps: 1 },
    });
    expect(f.created).toHaveLength(1);
    expect(f.deleted).toEqual(["ses_1"]);
  });

  it("maps error types", () => {
    expect(errorKind("provider.auth")).toBe("auth");
    expect(errorKind("provider.rate-limit")).toBe("rate-limit");
    expect(errorKind("provider.timeout")).toBe("timeout");
    expect(errorKind("provider.internal")).toBe("provider");
    expect(errorKind("aborted")).toBe("aborted");
    expect(errorKind("unknown")).toBe("runner");
  });

  it("interrupts and deletes the session on timeout", async () => {
    const f = fake([{ messages: [], hang: true, tokens: 4 }]);
    const error = await createOpencodeReviewer({ timeoutMs: 20 }, f.connect)
      .review(request)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: "timeout", usage: { attempts: 1 } });
    expect((error as ReviewerError).usage.tokens.input).toBe(4);
    expect(f.interrupted).toEqual(["ses_1"]);
    expect(f.deleted).toEqual(["ses_1"]);
  });

  it("reports caller aborts as aborted", async () => {
    const f = fake([{ messages: [], hang: true }]);
    const controller = new AbortController();
    const pending = createOpencodeReviewer({}, f.connect)
      .review({ ...request, signal: controller.signal })
      .catch((e: unknown) => e);
    setTimeout(() => {
      controller.abort();
    }, 10);

    expect(await pending).toMatchObject({ kind: "aborted" });
    expect(f.deleted).toEqual(["ses_1"]);
  });

  it("starts one server for concurrent reviews and stops it on close", async () => {
    const f = fake([
      { messages: [assistant(valid)] },
      { messages: [assistant(valid)] },
    ]);
    const reviewer = createOpencodeReviewer({}, f.connect);

    await Promise.all([reviewer.review(request), reviewer.review(request)]);
    await reviewer.close();

    expect(f.connect).toHaveBeenCalledTimes(1);
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it("waits until the agent is loaded", async () => {
    const f = fake([{ messages: [assistant(valid)] }], "2.0.26", 2);
    await createOpencodeReviewer({}, f.connect).review(request);

    expect(f.agentPolls()).toBe(3);
  });

  it("rejects unsupported OpenCode versions", async () => {
    const f = fake([], "1.19.0");
    const error = await createOpencodeReviewer({}, f.connect)
      .review(request)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: "runner" });
    expect((error as Error).message).toContain("found 1.19.0");
    expect(f.close).toHaveBeenCalled();
  });

  it("rejects model ids without a provider", async () => {
    const f = fake([]);
    await expect(
      createOpencodeReviewer({}, f.connect).review({
        ...request,
        model: "deepseek",
      }),
    ).rejects.toMatchObject({ kind: "runner" });
  });
});

describe("parseOutput", () => {
  it("accepts surrounding prose and fences", () => {
    expect(parseOutput(`Here:\n${valid}\nDone.`, schema).success).toBe(true);
  });

  it("reports schema errors", () => {
    const parsed = parseOutput('{"findings":[{}]}', schema);
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error).toContain("message");
  });
});
