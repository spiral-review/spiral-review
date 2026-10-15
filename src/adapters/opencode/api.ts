// Narrow port over the OpenCode 2.x HTTP API. Responses are validated so server drift fails loudly.
import { z } from "zod";

export interface PermissionRule {
  readonly action: string;
  readonly resource: string;
  readonly effect: "allow" | "deny" | "ask";
}

export interface CreateSessionInput {
  readonly title: string;
  readonly agent: string;
  readonly model: { readonly providerID: string; readonly id: string };
  readonly directory: string;
  readonly permissions: readonly PermissionRule[];
}

const tokensSchema = z.object({
  input: z.number(),
  output: z.number(),
  reasoning: z.number(),
  cache: z.object({ read: z.number(), write: z.number() }),
});

const sessionSchema = z.object({
  id: z.string(),
  cost: z.number(),
  tokens: tokensSchema,
});

const assistantMessageSchema = z.object({
  type: z.literal("assistant"),
  time: z.object({ created: z.number() }),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  error: z.object({ type: z.string(), message: z.string() }).optional(),
});

export type SessionInfo = z.infer<typeof sessionSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export interface OpencodeApi {
  version(): Promise<string>;
  hasAgent(agent: string, directory: string): Promise<boolean>;
  createSession(input: CreateSessionInput): Promise<string>;
  prompt(sessionID: string, text: string): Promise<void>;
  /** Resolves when the session is idle. */
  wait(sessionID: string, signal: AbortSignal): Promise<void>;
  interrupt(sessionID: string): Promise<void>;
  assistantMessages(sessionID: string): Promise<AssistantMessage[]>;
  session(sessionID: string): Promise<SessionInfo>;
  deleteSession(sessionID: string): Promise<void>;
}

/** Above any sane step cap; one page is enough. */
const MESSAGE_PAGE = 200;

export function createHttpApi(url: string, authorization: string): OpencodeApi {
  const call = async (
    method: string,
    path: string,
    options: { body?: unknown; signal?: AbortSignal; ok?: number[] } = {},
  ): Promise<unknown> => {
    const response = await fetch(new URL(path, url), {
      method,
      headers: { authorization, "content-type": "application/json" },
      body: options.body === undefined ? null : JSON.stringify(options.body),
      signal: options.signal ?? null,
    });
    const text = await response.text();
    if (!(options.ok ?? [200]).includes(response.status)) {
      throw new Error(
        `OpenCode ${method} ${path}: HTTP ${String(response.status)} ${text.slice(0, 500)}`,
      );
    }
    return text === "" ? undefined : (JSON.parse(text) as unknown);
  };
  const data = <T>(schema: z.ZodType<T>, value: unknown): T =>
    z.object({ data: schema }).parse(value).data;
  const session = (id: string) => `/api/session/${encodeURIComponent(id)}`;

  return {
    async version() {
      return z
        .object({ version: z.string() })
        .parse(await call("GET", "/api/info")).version;
    },
    async hasAgent(agent, directory) {
      const query = new URLSearchParams({ "location[directory]": directory });
      const value = await call(
        "GET",
        `/api/agent/${encodeURIComponent(agent)}?${query.toString()}`,
        {
          ok: [200, 404],
        },
      );
      return z.object({ data: z.unknown() }).safeParse(value).success;
    },
    async createSession(input) {
      const { directory, ...rest } = input;
      const body = { ...rest, location: { directory } };
      return data(
        z.object({ id: z.string() }),
        await call("POST", "/api/session", { body }),
      ).id;
    },
    async prompt(sessionID, text) {
      await call("POST", `${session(sessionID)}/prompt`, { body: { text } });
    },
    async wait(sessionID, signal) {
      await call(
        "POST",
        `/api/experimental/session/${encodeURIComponent(sessionID)}/wait`,
        {
          signal,
          ok: [204],
        },
      );
    },
    async interrupt(sessionID) {
      await call("POST", `${session(sessionID)}/interrupt`);
    },
    async assistantMessages(sessionID) {
      const query = new URLSearchParams({
        type: "assistant",
        order: "asc",
        limit: String(MESSAGE_PAGE),
      });
      const value = await call(
        "GET",
        `${session(sessionID)}/message?${query.toString()}`,
      );
      return data(z.array(assistantMessageSchema), value);
    },
    async session(sessionID) {
      return data(sessionSchema, await call("GET", session(sessionID)));
    },
    async deleteSession(sessionID) {
      await call("DELETE", session(sessionID), { ok: [204] });
    },
  };
}
