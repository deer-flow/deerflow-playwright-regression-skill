# Deer-flow Case Matrix

Use this reference only when the user asks to create or expand Playwright specs.

## P0 Daily Regression

- workspace boot redirects correctly
- new chat opens and sends a message
- thread URL switches from `new` to a stable thread id
- recent chat list loads and opens an existing thread
- settings dialog opens and each section is reachable
- skills settings loads and toggles a skill
- agent creation flow validates name and reaches bootstrap chat

## P1 Nightly Smoke

- live backend chat can stream a response
- thread persistence survives page reload
- thread rename and delete work
- export markdown and export json trigger downloads
- artifact button appears when a conversation has artifacts
- memory page loads and basic fact CRUD works

## P2 Debug Or Flaky Coverage

- file upload during chat submission
- stop generation during streaming
- hidden-tab notification after completion
- share link copies expected URL

## Deer-flow Notes

- Prefer mock-safe regression for daily runs.
- Keep live smoke intentionally small.
- Test against `origin/main` in an isolated worktree, not the user's dirty workspace.
- Use `playwright-cli` for failure diagnosis, not for the scheduled regression executor.

