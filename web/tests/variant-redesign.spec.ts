import { test, expect } from "@playwright/test";

test("public home explains the product and opens the real account flow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Shared funds. Considered together." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open treasury", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start browser session", exact: true }),
  ).toBeVisible();
  await page.goto("/#approvals");
  await expect(
    page.getByRole("heading", { name: "Approve together.", exact: true }),
  ).toBeVisible();
});

test("walkthrough is labeled, selectable, pausable and never opens media or submits writes", async ({
  page,
}) => {
  const writes: string[] = [];
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => {
      throw new Error("Landing requested media");
    };
  });
  page.on("request", (r) => {
    if (["POST", "PUT", "DELETE", "PATCH"].includes(r.method()))
      writes.push(r.url());
  });
  await page.goto("/landing/");
  await expect(
    page
      .getByText("Illustrative walkthrough · example data", { exact: true })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "03 Verify & approve", exact: true })
    .click();
  await expect(page.getByLabel("Product walkthrough")).toContainText(
    "Approval recorded",
  );
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    )
    .toBe(0);
  await page
    .getByRole("button", { name: "Resume motion", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    )
    .toBe(0);
  expect(writes).toEqual([]);
});

test("workspace categories and history preserve the active task", async ({
  page,
}) => {
  await page.goto("/treasury/#account");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your shared vault", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  await page.getByRole("button", { name: "Approvals", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Approve together.", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Prepare a payment.", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Your shared vault", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Prepare a payment.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Members", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Members & verification", exact: true }),
  ).toBeVisible();
});

test("account paths reveal only the selected form without bypassing session authorization", async ({
  page,
}) => {
  await page.goto("/treasury/#account");
  await expect(page.getByLabel("New username", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Local account", { exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Use saved account", exact: true })
    .click();
  await expect(page.getByLabel("Local account", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("New username", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use local account", exact: true }),
  ).toBeDisabled();
});

test("mobile workspace retains device help", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/treasury/#approvals");
  await expect(
    page.getByRole("link", { name: "Device help", exact: true }),
  ).toBeVisible();
});
test("reference artwork text has contrast", async ({ page }) => {
  await page.goto("/design/");
  const ratio = await page
    .getByText("INDEPENDENT PEOPLE", { exact: true })
    .evaluate((el) => {
      const luminance = (css: string) => {
        const [r, g, b] = css
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => v / 255)
          .map((v) =>
            v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
          );
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      };
      const a = luminance(getComputedStyle(el).color),
        b = luminance(getComputedStyle(el.parentElement!).backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test("mobile account explanation waits until the preview is visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const steps = page.locator(
    ".mobile-preview .preview-account-sequence > span",
  );
  const running = () =>
    steps.evaluateAll(
      (elements) =>
        elements
          .flatMap((e) => e.getAnimations())
          .filter((a) => a.playState === "running").length,
    );
  expect(await running()).toBe(0);
  await steps.first().scrollIntoViewIfNeeded();
  await expect.poll(running).toBeGreaterThan(0);
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(running).toBe(0);
});

test("reference design reflows on narrow screens and keeps controls readable", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/treasury/#account",
      "/treasury/#object",
      "/treasury/#approvals",
      "/device-check/",
    ]) {
      await page.goto(path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}`,
      ).toBe(true);
      for (const input of await page.locator("input,select,textarea").all()) {
        if (await input.isVisible())
          expect(
            await input.evaluate((e) =>
              parseFloat(getComputedStyle(e).fontSize),
            ),
          ).toBeGreaterThanOrEqual(16);
      }
    }
  }
});
