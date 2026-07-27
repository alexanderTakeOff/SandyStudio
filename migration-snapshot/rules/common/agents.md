# Agent Orchestration

## Available Agents

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |
| rust-reviewer | Rust code review | Rust projects |

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker

## ALWAYS overlay agent reports onto the SERVER LOGS (runtime beats static)

> **Personal directive from the Director. Cross-project. Established 2026-07-11 (SandyStudio E27).**
> «отчёт агентов всегда накладывай на логи сервера. субагенты не умнее тебя — может только сессия у них почище.»

A subagent's report — and your OWN "the code says X, so it works" reading — is a
**hypothesis, not ground truth**. Subagents are not smarter than the orchestrator; they
just run in a cleaner context. Their conclusions can be confidently wrong. Before acting on
any agent finding, **verify it against the live runtime**: server/app logs, job-queue logs
(e.g. Inngest), the database, actual emitted events and produced artifacts.

- When a report claims a mechanism "works / already handles X", find the **log line that
  proves it fired and produced the effect** — not merely that the code path exists.
- **Runtime evidence overrides static analysis.** If logs and code-reading disagree, the
  logs win — re-open the investigation.
- Provider/agent stalls and framework misuse (e.g. nested step tooling, dropped events,
  hung fetches) surface in the server log FIRST. Read the logs before theorising, and
  cross-check every agent's conclusion against them.

**Why it exists (the case that established it):** a code-review subagent concluded an
existing block "already does the Mode-3 auto-advance" — true that the code existed, so the
work was nearly dropped as redundant. But the server log showed that block was **broken at
runtime** (`NESTING_STEPS`: a `step.sendEvent` nested inside a `step.run` — dozens of
warnings), so it flipped the asset's status but silently dropped the follow-on event. One
`grep` of the prod log revealed what neither the reviewer's nor the orchestrator's static
reading caught. Static analysis narrows the search; the server log delivers the verdict.
