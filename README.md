# deerflow-maintain-skills

Maintenance skills for DeerFlow live/mock regression and related upkeep workflows.

## Layout

- `deerflow-playwright-regression/`
  - Playwright regression skill for DeerFlow
  - contains `SKILL.md`, `scripts/`, `assets/`, and `references/`

## Conventions

- One skill per top-level folder.
- Each skill folder should be self-contained.
- Shared repo-level files should stay minimal and generic.

## Extending Test Cases

All Playwright specs live in `deerflow-playwright-regression/assets/playwright-runner/tests/smoke.spec.ts`.

### Where to add

| Suite | Location in file | Runs when |
|-------|-----------------|-----------|
| P0 (mock + live) | outer `test.describe` | always |
| P1 (live only) | inner `test.describe("live", ...)` | `DEERFLOW_E2E_SUITE=live` |

### Example: adding a P0 test

```typescript
test("workspace boot redirects to chats", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/workspace\/chats/);
});
```

### Example: adding a P1 live test

```typescript
// inside test.describe("live", () => { ... })
test("live thread persistence survives reload", async ({ page, request }) => {
  const threadId = await createTitledThread(request, uniqueThreadTitle());
  await page.goto(`/workspace/chats/${threadId}`);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/workspace/chats/${threadId}$`));
  await expect(page.getByRole("textbox").first()).toBeVisible();
});
```

### Finding reliable locators

Use Playwright Codegen to record interactions against the live app and auto-generate selectors:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:2026 \
  pnpm exec playwright codegen http://127.0.0.1:2026/workspace/chats
```

### Keeping the case matrix in sync

After adding a spec, mark the corresponding row in `references/deerflow-case-matrix.md` as `[x]`.
