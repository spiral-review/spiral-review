import { describe, expect, it } from "vitest";
import { createProgram } from "./cli.js";
import { VERSION } from "./index.js";

describe("cli", () => {
  it("exposes the planned commands", () => {
    const names = createProgram().commands.map((c) => c.name());
    expect(names).toEqual(["init", "review", "hook", "pr", "stats"]);
  });

  it("reports the package version", () => {
    expect(createProgram().version()).toBe(VERSION);
  });

  it("hook succeeds as a no-op", async () => {
    await expect(
      createProgram().parseAsync(["hook"], { from: "user" }),
    ).resolves.toBeDefined();
  });
});
