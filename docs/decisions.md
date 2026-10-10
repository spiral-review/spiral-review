# Decision Log

Key decisions made during the project. Details in the linked ADRs.

| **Decision** | **Date** | **Alternatives Considered** | **Reasoning** | **Detailed doc** | **Made By** | **Work Required** |
| --- | --- | --- | --- | --- | --- | --- |
| General design: TypeScript CLI, OpenCode SDK reviewers with structured output, Claude Code via hooks only, local-first, layered config. | 2026-10-10 | Bash/Python, text verdict parsing, direct Claude calls, CI-first | Official OpenCode SDK gives typed findings; subscription terms limit Claude to hooks; quota stays on the developer's machine. | [ADR-001 - General design](adr/ADR-001_general-design.md) | Luca Dalla Valle | - |
