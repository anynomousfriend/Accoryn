import { test, expect } from "@playwright/test";

test("device checks wait for a person to start; no capture upload or automatic access", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method()))
      writes.push(request.url());
  });
  await page.goto("/device-check/");
  await expect(
    page.getByRole("heading", { name: "Check your device" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start camera" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Start microphone" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "I heard the tone" }),
  ).toHaveCount(0);
  await expect(page.getByText("0 of 3 checks confirmed")).toBeVisible();
  expect(
    await page.evaluate(
      async () =>
        (
          await navigator.permissions.query({
            name: "camera" as PermissionName,
          })
        ).state,
    ),
  ).toBe("prompt");
  expect(writes).toEqual([]);
});

test("a real browser permission denial is actionable and retryable", async ({
  page,
  context,
}) => {
  // Native Chromium permission policy, not a stub of getUserMedia or a fake stream.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Browser.setPermission", {
    permission: { name: "camera" },
    setting: "denied",
    origin: "http://127.0.0.1:5173",
  });
  await page.goto("/device-check/");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("alert")).toContainText(/permission|available/i);
  await expect(
    page.getByRole("button", { name: "Retry camera" }),
  ).toBeEnabled();
  await expect(page.getByText("0 of 3 checks confirmed")).toBeVisible();
});

test("speaker requires real playback and explicit audibility confirmation; reset clears it", async ({
  page,
}) => {
  await page.goto("/device-check/");
  await page.getByRole("button", { name: "Play test tone" }).click();
  await expect(
    page.getByRole("button", { name: "I heard the tone" }),
  ).toBeVisible();
  await expect(page.getByText("0 of 3 checks confirmed")).toBeVisible();
  await page.getByRole("button", { name: "I heard the tone" }).click();
  await expect(page.getByText("1 of 3 checks confirmed")).toBeVisible();
  await page.getByRole("button", { name: "Reset checks" }).click();
  await expect(page.getByText("0 of 3 checks confirmed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play test tone" }),
  ).toBeEnabled();
});

test("phone layout keeps controls in view without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/device-check/");
  await expect(
    page.getByRole("button", { name: "Start camera" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const buttons = page.getByRole("button");
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
