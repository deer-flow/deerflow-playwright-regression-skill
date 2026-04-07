---
name: deerflow-playwright-regression
description: Use when the user wants Codex to run, rerun, debug, or schedule Playwright regression for deer-flow against a user-specified repo/ref or, by default, the latest main branch from https://github.com/bytedance/deer-flow. This skill prepares an isolated git worktree, prefers committed Playwright tests for repeatable runs, uses playwright-cli only for exploratory debugging, stores artifacts, and can guide daily regression workflows for mock or live suites.
metadata:
  short-description: Run deer-flow Playwright regression on main
---

# DeerFlow Playwright Regression

Use this skill for repeatable Playwright regression on `deer-flow`, especially when the target is a clean repo/ref rather than the user's dirty working tree.

## Use This Skill For

- Daily regression against the latest `main` from `https://github.com/bytedance/deer-flow`
- Re-running failed Playwright suites in a clean worktree
- Debugging a failed spec with `playwright-cli`
- Adding or refining deer-flow e2e cases

If the user only wants manual browser exploration, still use this skill but prefer `playwright-cli` over writing new tests.

## Default Operating Mode

1. Allow the user to specify the local repo root and the branch/ref to test.
2. If the user does not specify either, default to the latest `main` from `https://github.com/bytedance/deer-flow`.
3. Run against an isolated worktree checked out from that target ref.
4. Prefer the skill-bundled Playwright runner for local-only regression.
5. If the repo already contains committed Playwright specs and the user explicitly wants them, run those instead.
6. Use `playwright-cli` only to inspect failures, verify selectors, or reproduce a bug interactively.
7. Default to a mock-safe suite unless the user explicitly asks for live backend coverage.
8. Keep evidence: HTML report, junit, logs, screenshots, traces.

## Environment Preparation

- If the user gives a repo root, pass it with `--repo`.
- If the user gives a branch or ref, pass it with `--branch`.
- If the user gives neither, align the regression target to `https://github.com/bytedance/deer-flow` and use the latest `main`.
- When using the default target, make sure the local repo has an `upstream` remote pointing at `https://github.com/bytedance/deer-flow` or `git@github.com:bytedance/deer-flow.git`.
- Prefer an isolated worktree over the user's dirty working tree whenever possible.

## Quick Start

The helper script prepares a clean worktree and runs the skill-bundled Playwright config by default:

```bash
bash ./scripts/run_deerflow_regression.sh \
  --repo /path/to/deer-flow \
  --suite mock
```

Run against a live stack that is already up:

```bash
bash ./scripts/run_deerflow_regression.sh \
  --repo /path/to/deer-flow \
  --suite live \
  --base-url http://127.0.0.1:2026 \
  -- --project=chromium
```

Use a custom start command:

```bash
bash ./scripts/run_deerflow_regression.sh \
  --repo /path/to/deer-flow \
  --suite mock \
  --start-cmd 'cd frontend && pnpm dev --hostname 127.0.0.1 --port 3000'
```

## Deer-flow Guidance

- Daily regression should favor deterministic coverage first. Use the skill-bundled runner plus mock fixtures and route stubs for routine runs.
- Only keep a small live smoke suite for backend, streaming, and persistence checks.
- For deer-flow specific case coverage, read `references/deerflow-case-matrix.md`.
- The bundled runner lives under `assets/playwright-runner/` and is intended for local-only use.
- If the user wants repo-owned Playwright config, scaffold it separately on request.

## Standard Workflow

1. Resolve the repo root and verify it is a git worktree.
2. Determine the target repo/ref:
   - use the user-specified repo/ref when provided
   - otherwise align to the latest `main` from `https://github.com/bytedance/deer-flow`
3. Fetch the selected remote/ref unless the user explicitly asks not to.
4. Create a temporary detached worktree from the selected target ref.
5. Use the skill-bundled Playwright runner unless `--use-repo-config` is explicitly requested.
6. Start the app if a start command was provided. Otherwise assume the target base URL is already serving.
7. Run Playwright with `CI=1` and store artifacts under `.artifacts/playwright/<timestamp>/`.
8. If tests fail, inspect the first failing spec and only then switch to `playwright-cli` for targeted debugging.
9. Summarize failures with file paths to report, logs, and traces.

## When To Use playwright-cli

Use `playwright-cli` only for:

- inspecting the live DOM after a failure
- checking whether a locator is unstable
- reproducing a flaky interaction manually
- verifying a new flow before codifying it in a spec

Do not substitute `playwright-cli` for the scheduled regression run itself.

## Reporting Back

Always report:

- branch or ref tested
- suite type: `mock` or `live`
- base URL used
- passed and failed spec count
- artifact directory
- whether the stack was already running or started during the run
