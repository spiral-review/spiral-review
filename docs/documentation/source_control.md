# Source Control

## Table of Contents

1. [General guidelines](#general-guidelines)
2. [Merging strategy](#merging-strategy)
3. [Branch naming](#branch-naming)
4. [Commit messages](#commit-messages)

## General guidelines

- We adopt Trunk Based Development. More info: [link](https://trunkbaseddevelopment.com/).
- Our default branch is the 'trunk', named `main`.
- We merge into `main` only through PRs with green CI. `main` is protected on `origin`; where the plan can't protect it, a `no-commit-to-branch` pre-commit hook blocks local commits to it.
- We open short-lived branches from `main` (one person, a couple of days at most) and merge them back through PR review and CI.
- We don't use release branches (unless strictly necessary) and we release from `main`.

### Diagram

```mermaid
gitGraph
    commit
    branch feat/42_login
    commit
    commit
    checkout main
    merge feat/42_login id: "PR #43"
    branch fix/57_rounding
    commit
    checkout main
    merge fix/57_rounding id: "PR #58"
    branch chore/update-deps
    commit
    checkout main
    merge chore/update-deps id: "PR #59"
    commit
```

Every branch starts from the tip of `main` and lands back on it as one squashed commit; nobody works on `main` directly. Based on [trunkbaseddevelopment.com](https://trunkbaseddevelopment.com/).

## Merging strategy

- We squash merge PRs: each PR lands on `main` as one commit, keeping history linear.
- The squash commit subject is the PR title, so PR titles follow the [commit message](#commit-messages) rules (GitHub appends `(#<PR number>)`).
- Commits inside the PR branch are not preserved; no need to clean them up before merging.

## Branch naming

- We follow this template: `<type>/<title>`, or `<type>/<issue number>_<title>` when the work has a GitHub issue; reference it in the PR body (e.g. `Closes #42`) so it is linked and auto-closed.
  - The `<type>` is the [Conventional Commits](#commit-messages) type of the PR title (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, …), so branch and squash commit share one vocabulary.
  - One extra type: `experiment`, for work never meant to be merged.
  - Urgent fixes are `fix`; flag the urgency in the PR, not in the branch name.

### Examples

- `feat/42_add-login` (GitHub issue #42)
- `fix/57_rounding` (GitHub issue #57)
- `docs/update-readme`
- `chore/update-deps`
- `experiment/try-bun`

## Commit messages

- The essential parts of a commit message are:
  - subject line: a short description of the commit, maximum 50 characters long.
  - body (optional): a longer description of the commit, wrapped at 72 characters, separated from the subject line by a blank line.
- The subject line is written in the imperative mood, in English.
- We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Some examples:
  - `feat: add new feature`
  - `fix: fix user creation critical bug`
  - `chore: update deps`
  - `docs: update readme`
