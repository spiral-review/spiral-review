import { Command } from "@commander-js/extra-typings";
import { VERSION } from "./index.js";

function notImplemented(name: string): never {
  console.error(`spiral-review ${name}: not implemented yet`);
  process.exit(1);
}

export function createProgram(): Command {
  const program = new Command()
    .name("spiral-review")
    .description(
      "Risk-tiered, budget-aware, multi-model code review around your coding agent",
    )
    .version(VERSION);

  program
    .command("init")
    .description("Check prerequisites and install the coding-agent integration")
    .action(() => {
      notImplemented("init");
    });

  program
    .command("review")
    .description("Review the current branch against its base")
    .action(() => {
      notImplemented("review");
    });

  program
    .command("hook")
    .description(
      "Entry point for coding-agent hooks (not meant to be run by hand)",
    )
    .action(() => {
      // Never fail closed (north star R7): a stub hook must let the agent's turn end.
    });

  program
    .command("pr")
    .description("Review a pull request and post the digest")
    .option("--create", "review the branch, then open the PR")
    .action(() => {
      notImplemented("pr");
    });

  program
    .command("stats")
    .description("Show accepted/rejected findings per lens and model")
    .action(() => {
      notImplemented("stats");
    });

  return program;
}
