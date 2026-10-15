// Starts a private `opencode serve --stdio`. The server exits when its stdin closes, so it dies with this process.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

export interface ServerOptions {
  /** Merged last into OpenCode's config (`OPENCODE_CONFIG_CONTENT`). */
  readonly config: object;
  readonly timeoutMs: number;
  readonly command?: string;
}

export interface Server {
  readonly url: string;
  /** Basic auth header value for every request. */
  readonly authorization: string;
  stop(): Promise<void>;
}

const STOP_GRACE_MS = 2000;

export function startServer(options: ServerOptions): Promise<Server> {
  const password = randomBytes(32).toString("base64url");
  const proc = spawn(
    options.command ?? "opencode",
    ["serve", "--stdio", "--hostname=127.0.0.1", "--port=0"],
    {
      env: {
        ...process.env,
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config),
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stderr = "";
  proc.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-2000);
  });

  const exited = new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) resolve();
    else
      proc.once("exit", () => {
        resolve();
      });
  });

  const stop = async () => {
    proc.stdin.end();
    const timer = setTimeout(() => proc.kill(), STOP_GRACE_MS);
    await exited;
    clearTimeout(timer);
  };

  return new Promise<Server>((resolve, reject) => {
    const lines = createInterface({ input: proc.stdout });
    const fail = (error: Error) => {
      clearTimeout(timer);
      lines.close();
      void stop();
      reject(error);
    };
    const timer = setTimeout(() => {
      fail(
        new Error(
          `opencode serve did not start within ${String(options.timeoutMs)}ms`,
        ),
      );
    }, options.timeoutMs);
    const onError = (error: Error) => {
      fail(error);
    };
    const onEarlyExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      fail(
        new Error(
          `opencode serve exited (${String(signal ?? code)}) before listening: ${stderr.trim()}`,
        ),
      );
    };
    proc.on("error", onError);
    proc.once("exit", onEarlyExit);
    lines.on("line", (line) => {
      let url: unknown;
      try {
        url = (JSON.parse(line) as { url?: unknown }).url;
      } catch {
        return;
      }
      if (typeof url !== "string") return;
      clearTimeout(timer);
      lines.close();
      proc.off("exit", onEarlyExit);
      proc.off("error", onError);
      proc.on("error", () => undefined);
      // Never keep the caller's event loop alive; the server still stops when this process exits.
      proc.unref();
      proc.stdout.resume();
      for (const stream of [proc.stdin, proc.stdout, proc.stderr]) {
        (stream as unknown as { unref?: () => void }).unref?.();
      }
      resolve({
        url,
        authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
        stop,
      });
    });
  });
}
