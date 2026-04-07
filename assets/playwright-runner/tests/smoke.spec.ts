import { expect, test } from "@playwright/test";

test.describe("deer-flow local smoke", () => {
  test("workspace new chat page loads", async ({ page }) => {
    await page.route("**/api/models", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          models: [
            {
              name: "mock-model",
              display_name: "Mock Model",
              supports_thinking: true,
              supports_reasoning_effort: true,
            },
          ],
        }),
      });
    });

    await page.goto("/workspace/chats/new");
    await expect(page).toHaveURL(/\/workspace\/chats\/new$/);
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });

  test("agent creation page loads", async ({ page }) => {
    await page.goto("/workspace/agents/new");
    await expect(page).toHaveURL(/\/workspace\/agents\/new$/);
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });
});
