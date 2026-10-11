// Programmatic API (ADR-001 D7). The CLI and coding-agent integrations are thin wrappers around it.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export const VERSION: string = pkg.version;
