import { test, expect } from "@playwright/test";

// Catch a marketing CTA that does not reach the actual hardware checks.
test("landing links to real readiness", async ({ page }) => {
  await page.goto("/landing/");
  await expect(
    page.getByRole("heading", { name: "One decision. Made together." }),
  ).toBeVisible();
  await expect(
    page.getByText("Research prototype", { exact: true }),
  ).toBeVisible();
  const start = page
    .getByRole("link", { name: "Check your device", exact: true })
    .first();
  await expect(start).toHaveAttribute("href", "/device-check/");
  await page
    .getByRole("link", { name: "How it works", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "One proposal. Everyone on the same page.",
    }),
  ).toBeInViewport();
  await start.click();
  await expect(
    page.getByRole("button", { name: "Start camera" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start microphone" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play test tone" }),
  ).toBeVisible();
  await expect(page.getByText("0 of 3 checks confirmed")).toBeVisible();
});

// Catch stale confirmation or a late speaker callback after document navigation.
test("direct entry and history clear readiness state", async ({ page }) => {
  await page.goto("/device-check/");
  const reference = page.getByRole("link", {
    name: "UI reference",
    exact: true,
  });
  await expect(reference).toBeVisible();
  await page.getByRole("button", { name: "Play test tone" }).click();
  await reference.click();
  await expect(
    page.getByRole("heading", { name: "Experience reference" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByText("0 of 3 checks confirmed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "I heard the tone" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Play test tone" }).click();
  await page.getByRole("button", { name: "I heard the tone" }).click();
  await expect(page.getByText("1 of 3 checks confirmed")).toBeVisible();
  await reference.click();
  await page.goBack();
  await expect(page.getByText("0 of 3 checks confirmed")).toBeVisible();
});

// Catch fixed desktop widths, clipped identifiers and undersized controls.
test("layouts reflow with long reference content", async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/device-check/", "/design/?content=long"]) {
      await page.goto(path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}px`,
      ).toBe(true);
      for (const control of await page.locator("button, a, select").all()) {
        if (!(await control.isVisible())) continue;
        const box = await control.boundingBox();
        if (!box) continue;
        expect(
          box.height,
          (await control.textContent()) ?? "",
        ).toBeGreaterThanOrEqual(44);
        expect(
          box.width,
          (await control.textContent()) ?? "",
        ).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.locator("meta[name=viewport]").getAttribute("content"),
      ).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
      if (path.includes("content=long")) {
        await expect(
          page.getByRole("group", { name: "Recipient", exact: true }),
        ).toContainText("a".repeat(64));
        expect(
          await page
            .getByRole("group", { name: "Recipient", exact: true })
            .evaluate((element) => getComputedStyle(element).userSelect),
        ).not.toBe("none");
      }
    }
  }
});

test("unknown route offers a clear way home", async ({ page }) => {
  await page.goto("/unknown-page");
  await expect(
    page.getByRole("heading", { name: "This page is not here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to home", exact: true }),
  ).toHaveAttribute("href", "/");
});
