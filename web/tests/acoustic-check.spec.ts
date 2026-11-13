import { test, expect } from "@playwright/test";

// Real Chrome Web Audio and native permission policy; no stubbed audio or
// injected decode results. Physical speaker-to-microphone exchange is a manual
// test (docs/testing/acoustic-check-manual.md).

test("the acoustic check waits for a tap, then really broadcasts a fresh challenge and stops cleanly", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/acoustic-check/");
  await expect(page.getByRole("heading", { name: "Can these two devices hear each other?" })).toBeVisible();
  await expect(page.getByText("No trials yet.")).toBeVisible();

  await page.getByRole("button", { name: "Start broadcast" }).click();
  const code = page.getByText(/^Check code:/);
  await expect(code).toBeVisible();
  await expect(code.locator("span")).toHaveText(/^[0-9A-F]{6}$/);
  await expect(page.getByText("Playing", { exact: true })).toBeVisible();
  const first = await code.locator("span").textContent();

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Playing", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Start broadcast" }).click();
  await expect(code.locator("span")).not.toHaveText(first ?? "");
  await page.getByRole("button", { name: "Stop" }).click();
  expect(errors).toEqual([]);
});

test("a refused microphone is reported, not treated as silence", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Browser.setPermission", {
    permission: { name: "microphone" },
    setting: "denied",
    origin: "http://127.0.0.1:5173",
  });
  await page.goto("/acoustic-check/");
  await page.getByRole("button", { name: "Start listening" }).click();
  await expect(page.getByRole("alert")).toContainText(/microphone/i);
  await expect(page.getByText(/denied/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start listening" })).toBeEnabled();
});

test("the acoustic check fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/acoustic-check/");
  await expect(page.getByRole("button", { name: "Start listening" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
