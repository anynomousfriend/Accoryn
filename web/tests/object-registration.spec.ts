import { test, expect } from "@playwright/test";
test("root leads to registration with no eager model download or sensor request", async ({
  page,
}) => {
  const assets: string[] = [];
  page.on("request", (r) => {
    if (/\/(models|runtime)\//.test(r.url())) assets.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Continue to object registration" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Open registration directly" }).click();
  await expect(
    page.getByRole("heading", { name: "Register your object." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start registration", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(/Save this object's visual template in this browser/),
  ).toBeVisible();
  expect(assets).toEqual([]);
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
});
test("three confirmed inputs enable the continuation component without synthesizing sensor E2E", async ({
  page,
}) => {
  await page.goto("/tests/harness/readiness.html?count=2");
  await expect(
    page.getByRole("button", { name: "Continue to object registration" }),
  ).toBeDisabled();
  await page.goto("/tests/harness/readiness.html?count=3");
  await page
    .getByRole("link", { name: "Continue to object registration" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Register your object." }),
  ).toBeVisible();
});
test("failed model download can retry into a real native camera denial and stop cleanly", async ({
  page,
  context,
}) => {
  await page.route("**/models/**", (r) => r.abort("failed"));
  await page.goto("/object-registration/");
  await page
    .getByRole("button", { name: "Start registration", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(/load.*model/i);
  await page.unroute("**/models/**");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Browser.setPermission", {
    permission: { name: "camera" },
    setting: "denied",
    origin: "http://127.0.0.1:5173",
  });
  await page
    .getByRole("button", { name: "Retry registration", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    /camera|permission|available/i,
  );
  await page
    .getByRole("button", { name: "Stop and discard unsaved views" })
    .click();
  await expect(page.getByRole("status")).toContainText("Stopped");
});
test("real locally saved fixture enrollment is visible after navigation and explicit deletion survives reload", async ({
  page,
}) => {
  await page.goto("/tests/harness/registration.html");
  await page.waitForFunction(() => !!(window as any).registrationHarness);
  await page.evaluate(async () => {
    const h = (window as any).registrationHarness;
    await h.store.save(
      await h.makeTemplate("Computational test cup"),
      new AbortController().signal,
    );
  });
  await page.goto("/object-registration/");
  await expect(
    page.getByText("Computational test cup", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Compare a fresh scan" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Delete registration", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delete this registration?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep registration" }).click();
  await expect(
    page.getByText("Computational test cup", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete registration", exact: true })
    .click();
  await page.getByRole("button", { name: "Yes, delete registration" }).click();
  await expect(page.getByRole("status")).toContainText("Registration deleted");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Start registration", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Computational test cup", { exact: true }),
  ).toHaveCount(0);
});
test("actual fixture comparison renders signed scores and never an unlock confirmation", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/tests/harness/comparison.html");
  await expect(
    page.getByRole("heading", { name: "Scan compared" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText("Research comparison — does not unlock an account."),
  ).toBeVisible();
  await expect(
    page.getByText("Mean of the two highest similarities"),
  ).toBeVisible();
  await expect(page.getByText(/0\.6982/)).toBeVisible();
});
test("registration layout remains reachable at phone and laptop widths", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/object-registration/");
    await expect(
      page.getByRole("button", { name: "Start registration", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await page
      .getByRole("button", { name: "Start registration", exact: true })
      .boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page
    .getByRole("button", { name: "Start registration", exact: true })
    .focus();
  await expect(
    page.getByRole("button", { name: "Start registration", exact: true }),
  ).toBeFocused();
});
