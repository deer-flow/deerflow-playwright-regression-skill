import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const suite = process.env.DEERFLOW_E2E_SUITE ?? "mock";
const isLiveSuite = suite === "live";

function uniqueThreadTitle() {
  return `pw-live-thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createTitledThread(request: APIRequestContext, title: string) {
  const createRes = await request.post("/api/threads", {
    data: {
      metadata: {
        source: "playwright-regression",
      },
    },
  });
  expect(createRes.ok()).toBeTruthy();

  const created = (await createRes.json()) as { thread_id: string };
  expect(created.thread_id).toBeTruthy();

  const stateRes = await request.post(`/api/threads/${created.thread_id}/state`, {
    data: {
      values: { title },
      as_node: "playwright",
    },
  });
  expect(stateRes.ok()).toBeTruthy();

  return created.thread_id;
}

test.describe("deer-flow local smoke", () => {
  test("workspace new chat page loads", async ({ page }) => {
    if (!isLiveSuite) {
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
    }

    await page.goto("/workspace/chats/new");
    await expect(page).toHaveURL(/\/workspace\/chats\/new$/);
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });

  test("chats index page loads", async ({ page }) => {
    await page.goto("/workspace/chats");
    await expect(page).toHaveURL(/\/workspace\/chats$/);
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  test("agent creation page loads", async ({ page }) => {
    await page.goto("/workspace/agents/new");
    await expect(page).toHaveURL(/\/workspace\/agents\/new$/);
    await expect(page.getByRole("heading", { name: "Design your Agent" })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. code-reviewer")).toBeVisible();
  });

  test.skip(
    !isLiveSuite,
    "live-only smoke tests run only when DEERFLOW_E2E_SUITE=live",
  );

  test("live models api returns configured models", async ({ request }) => {
    const response = await request.get("/api/models");
    expect(response.ok()).toBeTruthy();

    const payload = (await response.json()) as {
      models?: Array<{ name?: string; display_name?: string }>;
    };
    expect(Array.isArray(payload.models)).toBeTruthy();
    expect((payload.models ?? []).length).toBeGreaterThan(0);
    expect(payload.models?.[0]?.name).toBeTruthy();
  });

  test("live existing thread page loads", async ({
    page,
    request,
  }) => {
    const title = uniqueThreadTitle();
    const threadId = await createTitledThread(request, title);

    await page.goto(`/workspace/chats/${threadId}`);
    await expect(page).toHaveURL(new RegExp(`/workspace/chats/${threadId}$`));
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });

  test("live backend wait run returns an assistant response", async ({
    request,
    baseURL,
  }) => {
    const resolvedBaseURL = baseURL ?? process.env.PLAYWRIGHT_BASE_URL;
    expect(resolvedBaseURL).toBeTruthy();

    const createRes = await request.post("/api/langgraph/threads", {
      data: { metadata: { source: "playwright-regression" } },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()) as { thread_id: string };

    const runRes = await request.post(`/api/threads/${created.thread_id}/runs/wait`, {
      timeout: 120_000,
      data: {
        assistant_id: "lead_agent",
        input: {
          messages: [
            {
              role: "user",
              content: "Reply with exactly: LIVE_SMOKE_OK",
            },
          ],
        },
        context: {
          mode: "flash",
          thinking_enabled: false,
          is_plan_mode: false,
          subagent_enabled: false,
        },
        on_completion: "keep",
      },
    });
    expect(runRes.ok()).toBeTruthy();

    const payload = (await runRes.json()) as {
      messages?: Array<{ type?: string; content?: unknown }>;
    };
    const messages = payload.messages ?? [];
    const lastAssistant = [...messages].reverse().find((message) => {
      return message.type === "ai";
    });

    expect(lastAssistant).toBeTruthy();
    const normalizedContent = JSON.stringify(lastAssistant?.content ?? "");
    expect(normalizedContent).toContain("LIVE_SMOKE_OK");
  });
});
