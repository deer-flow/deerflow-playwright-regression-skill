# Deer-flow Case Matrix

Use this reference only when the user asks to create or expand Playwright specs.

Legend: `[x]` = implemented in `smoke.spec.ts`, `[ ]` = not yet implemented (TODO)

## P0 Daily Regression

- [x] workspace boot redirects correctly (`/workspace` → `/workspace/chats/new`)
- [x] new chat page loads
- [x] chat input shows correct placeholder and is empty on load
- [x] submit button disabled when input empty, enabled when text entered
- [x] chats index page loads
- [x] chats search bar accepts text input
- [x] agent creation flow validates name and reaches bootstrap chat

## P1 Nightly Smoke

- [x] live models API returns configured models
- [x] live existing thread page loads
- [x] live thread persistence survives page reload
- [x] live thread rename updates stored title
- [x] live thread delete removes the thread (404 on re-fetch)
- [x] live submit message via UI triggers run and navigates to thread
- [x] live backend minimal run returns an assistant response
- [ ] export markdown and export json trigger downloads
- [ ] artifact button appears when a conversation has artifacts
- [ ] memory page loads and basic fact CRUD works

## P2 Debug Or Flaky Coverage

- [ ] file upload during chat submission
- [ ] stop generation during streaming
- [ ] hidden-tab notification after completion
- [ ] share link copies expected URL

## Deer-flow Notes

- Prefer mock-safe regression for daily runs.
- Keep live smoke intentionally small.
- Test against the selected repo/ref in an isolated worktree, defaulting to the latest `main` from `bytedance/deer-flow`, not the user's dirty workspace.
- Use `playwright-cli` for failure diagnosis, not for the scheduled regression executor.
