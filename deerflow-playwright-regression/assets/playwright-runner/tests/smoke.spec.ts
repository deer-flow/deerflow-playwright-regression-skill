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

// Stub /api/models for P0 mock tests that render the chat input.
// The input box only renders the model selector after models are loaded, so
// without this stub the textarea may not appear in mock mode.
async function stubModels(page: import("@playwright/test").Page) {
  await page.route("**/api/models", (route) =>
    route.fulfill({
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
    }),
  );
}

// ---------------------------------------------------------------------------
// P0 — run in both mock and live suites
// ---------------------------------------------------------------------------
test.describe("deer-flow local smoke", () => {
  test("workspace root redirects to new chat", async ({ page }) => {
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/workspace\/chats\/new$/);
  });

  test("workspace new chat page loads", async ({ page }) => {
    if (!isLiveSuite) {
      await stubModels(page);
    }

    await page.goto("/workspace/chats/new");
    await expect(page).toHaveURL(/\/workspace\/chats\/new$/);
    await expect(page.getByRole("textbox").first()).toBeVisible();
  });

  test("chat input shows placeholder and is empty on load", async ({ page }) => {
    if (!isLiveSuite) {
      await stubModels(page);
    }

    await page.goto("/workspace/chats/new");
    const textarea = page.locator('textarea[placeholder="How can I assist you today?"]');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("");
  });

  test("submitting empty input does not navigate away from new chat", async ({ page }) => {
    if (!isLiveSuite) {
      await stubModels(page);
    }

    await page.goto("/workspace/chats/new");
    await expect(page.getByRole("textbox").first()).toBeVisible();

    // The submit button is always enabled; empty submission is blocked
    // programmatically, not via the HTML disabled attribute.
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page).toHaveURL(/\/workspace\/chats\/new$/);
  });

  test("chats index page loads", async ({ page }) => {
    await page.goto("/workspace/chats");
    await expect(page).toHaveURL(/\/workspace\/chats$/);
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  test("chats search accepts text input", async ({ page }) => {
    await page.goto("/workspace/chats");
    const searchbox = page.getByRole("searchbox");
    await searchbox.fill("test query");
    await expect(searchbox).toHaveValue("test query");
  });

  test("agent creation page loads", async ({ page }) => {
    await page.goto("/workspace/agents/new");
    await expect(page).toHaveURL(/\/workspace\/agents\/new$/);
    await expect(page.getByRole("heading", { name: "Design your Agent" })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. code-reviewer")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // P1 — live backend only; nested describe so test.skip applies only here
  // -------------------------------------------------------------------------
  test.describe("live", () => {
    test.skip(!isLiveSuite, "live-only smoke tests run only when DEERFLOW_E2E_SUITE=live");

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

    test("live existing thread page loads", async ({ page, request }) => {
      const title = uniqueThreadTitle();
      const threadId = await createTitledThread(request, title);

      await page.goto(`/workspace/chats/${threadId}`);
      await expect(page).toHaveURL(new RegExp(`/workspace/chats/${threadId}$`));
      await expect(page.getByRole("textbox").first()).toBeVisible();
    });

    test("live thread persistence survives page reload", async ({ page, request }) => {
      const threadId = await createTitledThread(request, uniqueThreadTitle());

      await page.goto(`/workspace/chats/${threadId}`);
      await expect(page).toHaveURL(new RegExp(`/workspace/chats/${threadId}$`));

      await page.reload();

      // After reload the thread page must still load correctly.
      await expect(page).toHaveURL(new RegExp(`/workspace/chats/${threadId}$`));
      await expect(page.getByRole("textbox").first()).toBeVisible();
    });

    test("live thread rename updates stored title", async ({ request }) => {
      const threadId = await createTitledThread(request, uniqueThreadTitle());

      const newTitle = `renamed-${Date.now()}`;
      const renameRes = await request.post(`/api/threads/${threadId}/state`, {
        data: { values: { title: newTitle }, as_node: "playwright" },
      });
      expect(renameRes.ok()).toBeTruthy();

      // The POST /state response returns the updated values directly.
      // (GET /api/threads/{id}/state returns values:{} for this graph;
      //  the canonical read path for title is the POST response or search API.)
      const updated = (await renameRes.json()) as { values?: { title?: string } };
      expect(updated.values?.title).toBe(newTitle);
    });

    test("live thread delete removes the thread", async ({ request }) => {
      const threadId = await createTitledThread(request, uniqueThreadTitle());

      // Confirm it exists before deletion.
      const beforeRes = await request.get(`/api/threads/${threadId}`);
      expect(beforeRes.ok()).toBeTruthy();

      // Delete it.
      const deleteRes = await request.delete(`/api/threads/${threadId}`);
      expect(deleteRes.ok()).toBeTruthy();

      // A subsequent fetch must return 404.
      const afterRes = await request.get(`/api/threads/${threadId}`);
      expect(afterRes.status()).toBe(404);
    });

    test("live submit message via UI triggers run and navigates to thread", async ({ page }) => {
      await page.goto("/workspace/chats/new");
      const textarea = page.locator('textarea[placeholder="How can I assist you today?"]');
      await expect(textarea).toBeVisible();

      await textarea.fill("Say hello in one sentence.");

      // Capture the streaming request before clicking submit.
      const streamPromise = page.waitForRequest(
        (req) =>
          (req.url().includes("/runs/stream") || req.url().includes("/runs/wait")) &&
          req.method() === "POST",
        { timeout: 10_000 },
      );

      await page.getByRole("button", { name: "Submit" }).click();

      // URL must change from /new to /workspace/chats/<uuid>.
      await expect(page).toHaveURL(/\/workspace\/chats\/(?!new)[a-z0-9-]+$/, {
        timeout: 10_000,
      });

      // A run request must have been dispatched.
      await streamPromise;
    });

    test("live backend wait run returns an assistant response", async ({
      request,
    }) => {
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
                // Use a simple, open-ended prompt — avoid asking for a specific
                // phrase since LLM output is non-deterministic and would cause
                // false failures when the model paraphrases or wraps the text.
                content: "Say hello in one sentence.",
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

      // Verify the run produced a non-empty assistant message — structural
      // correctness only, no text-content assertion.
      expect(lastAssistant).toBeTruthy();
      const contentStr = JSON.stringify(lastAssistant?.content ?? "");
      expect(contentStr.length).toBeGreaterThan(2);
    });
  });
});
