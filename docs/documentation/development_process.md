# Development Process

Work runs in three loops, usually in sequence. A loop is defined by its scope, not by the document type: an ADR can come out of any loop. Each loop has its own review; its merged output informs the next loop.

| Loop      | Scope               | Artifacts                                                             | Review                                | Owner                                                          |
| --------- | ------------------- | --------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| Strategy  | product or epic     | `STRATEGY.md`, `ROADMAP.md`, ADRs                                     | dedicated docs PR                     | reviews and merges                                             |
| Feature   | one feature         | PRD (when product behaviour changes), implementation plan with chunks | dedicated docs PR                     | approves by merging                                            |
| Execution | one chunk of a plan | code, tests, decision log rows (`Made By: agent`)                     | code PR against the gate and the plan | merges; reviews closely when spiral-review flags `needs-human` |

Document formats and update policies: [README](./README.md). Where each decision is written: [Which level a decision belongs to](./README.md#which-level-a-decision-belongs-to).

## Loops

- **Strategy:** sets direction. Product documents (strategy, roadmap) and architecture (ADRs). The owner reviews, e.g. in a `grill` session, and merges every PR.
- **Feature:** specifies one roadmap step. A PRD for what the feature does, an implementation plan ([template](./plan_template.md)) for how. The plan breaks the work into execution chunks, one PR each, and states which depend on each other; the others can run in parallel. The owner approves the PRD or plan by merging it; execution starts only from a merged plan.
- **Execution:** agents implement the plan's chunks unattended. Done means the gate passes with real output ([Gate and Definition of Done](./README.md#gate-and-definition-of-done)). The owner merges after reading the review digest; a repo may opt into spiral-review's merge policy to merge execution PRs without the owner. An agent asks the owner only by the existing rules (e.g. a test or the gate looks wrong). The owner reads `Made By: agent` decision log rows after merge.

## Feedback to an earlier loop

A later loop never silently changes an earlier loop's merged documents. What it learns goes back up through the controlled mechanisms:

- a plan or PRD amendment ([Handling Changes to Immutable Documents](./README.md#handling-changes-to-immutable-documents));
- a new ADR that supersedes one ([Superseding an ADR](./README.md#superseding-an-adr)).

The amendment or new ADR goes in the same PR as the ongoing work, and that PR needs the owner's review: spiral-review classifies it as strategy or feature and flags it `needs-human`. Checking off execution chunks is not an amendment. Classification, tiers and the merge policy live in spiral-review (its PRD-001).

## Loop of a path

Which loop a changed file belongs to, so spiral-review can classify a PR. A PR's loop is the highest among its files.

| Loop      | Paths                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| Strategy  | `**/docs/adr/**`, `**/ROADMAP.md`, `**/STRATEGY.md`                               |
| Feature   | `**/docs/prd/**`, `**/docs/plans/**`, `**/docs/design/**`, `**/docs/decisions.md` |
| Execution | everything else                                                                   |

Exception: a change to `docs/decisions.md` that only appends `Made By: agent` rows is execution. Editing or removing a row, adding one made by the owner, or adding one that replaces an earlier row ("Replaces: …") is feature.

Classification, tiers, escalators and the merge policy live in spiral-review (its PRD-001); only this convention lives here.
