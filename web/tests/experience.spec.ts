import { test, expect } from "@playwright/test";

// These contracts catch accidental device access, misleading payment feedback,
// moving payment details, unreadable semantic colors and stacked motion.
test("reference is explicit and never requests device access", async ({
  page,
}) => {
  const writes: string[] = [];
  const external: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      writes.push(request.url());
    if (new URL(request.url()).origin !== "http://127.0.0.1:5173")
      external.push(request.url());
  });
  await page.goto("/design/");
  await expect(
    page.getByRole("heading", { name: "Experience reference" }),
  ).toBeVisible();
  await expect(
    page.getByText("Design reference — no transaction", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(send|approve|pay|retry payment)/i }),
  ).toHaveCount(0);
  for (const name of ["camera", "microphone"]) {
    expect(
      await page.evaluate(
        async (name) =>
          (await navigator.permissions.query({ name: name as PermissionName }))
            .state,
        name,
      ),
    ).toBe("prompt");
  }
  expect(writes).toEqual([]);
  expect(external).toEqual([]);
});

test("state inspection preserves proposal details", async ({ page }) => {
  await page.goto("/design/");
  const fields = ["Amount", "Asset", "Recipient", "Network", "Approval policy"];
  const before = await Promise.all(
    fields.map((name) =>
      page.getByRole("group", { name, exact: true }).boundingBox(),
    ),
  );
  const select = page.getByLabel("Inspect state");
  for (const [value, label] of [
    ["confirmed", "Payment confirmed"],
    ["unknown", "Checking transaction status"],
    ["submitted", "Submitted to NEAR"],
    ["approval-recorded", "Your approval recorded"],
  ]) {
    await select.selectOption(value);
    await expect(page.getByRole("status")).toHaveText(label!);
    for (let i = 0; i < fields.length; i++) {
      const after = await page
        .getByRole("group", { name: fields[i], exact: true })
        .boundingBox();
      expect(after).not.toBeNull();
      expect(Math.abs(after!.x - before[i]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after!.y - before[i]!.y)).toBeLessThanOrEqual(1);
    }
  }
  await expect(
    page.getByRole("group", { name: "Amount", exact: true }),
  ).toContainText("[Amount]");
});

test("semantic controls remain readable", async ({ page }) => {
  await page.goto("/design/");
  const colors = await page.locator("[data-contrast]").evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      let parent: Element | null = element;
      let background = "rgba(0, 0, 0, 0)";
      while (parent && background === "rgba(0, 0, 0, 0)") {
        background = getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement;
      }
      return { text: element.textContent, color: style.color, background };
    }),
  );
  expect(colors.length).toBeGreaterThanOrEqual(7);
  const luminance = (css: string) => {
    const rgb = css
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((c) => c / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  };
  for (const sample of colors) {
    const [low, high] = [
      luminance(sample.color),
      luminance(sample.background),
    ].sort((a, b) => a - b);
    expect(
      (high! + 0.05) / (low! + 0.05),
      sample.text ?? "",
    ).toBeGreaterThanOrEqual(4.5);
  }
  const replay = page.getByRole("button", { name: "Replay illustration" });
  await replay.focus();
  expect(
    await replay.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2
      );
    }),
  ).toBe(true);
});

test("motion respects interruption and input preferences", async ({ page }) => {
  await page.goto("/design/");
  const replay = page.getByRole("button", { name: "Replay illustration" });
  await replay.click();
  await page.waitForTimeout(80);
  await replay.click();
  await expect(replay).toBeEnabled();
  const counts = await page
    .locator("[data-frame-layer]")
    .evaluateAll((elements) =>
      elements.map(
        (element) =>
          element.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    );
  expect(counts.length).toBe(2);
  expect(counts.every((count) => count <= 1)).toBe(true);
  await expect
    .poll(
      () =>
        page
          .locator("[data-frame-layer]")
          .evaluateAll(
            (elements) =>
              elements
                .flatMap((element) => element.getAnimations())
                .filter((a) => a.playState === "running").length,
          ),
      { timeout: 800, intervals: [50] },
    )
    .toBe(0);
  await replay.click();
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
  await replay.click();
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
  ).toBe(0);
  await expect(
    page.getByRole("img", {
      name: "Independent frames meeting at a shared center",
    }),
  ).toBeVisible();
});

test("keyboard state selection updates immediately without motion", async ({
  page,
}) => {
  await page.goto("/design/");
  const select = page.getByLabel("Inspect state");
  await select.focus();
  // Native select type-ahead is a keyboard-only selection on macOS too.
  await select.press("p");
  await expect(select).toHaveValue("participation");
  await expect(page.getByRole("status")).toHaveText("Participation check");
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
  ).toBe(0);
});

test("illustration uses the shared motion token", async ({ page }) => {
  await page.goto("/design/");
  // Production CSS may normalize milliseconds into seconds.
  for (const value of ["200ms", "0.2s"]) {
    await page.evaluate(
      (value) =>
        document.documentElement.style.setProperty("--motion-explain", value),
      value,
    );
    await page.getByRole("button", { name: "Replay illustration" }).click();
    const durations = await page
      .locator("[data-frame-layer]")
      .evaluateAll((elements) =>
        elements
          .flatMap((element) => element.getAnimations())
          .map((animation) => animation.effect?.getTiming().duration),
      );
    expect(durations).toEqual([200, 200]);
  }
});

test("leaving the artwork viewport stops playback", async ({ page }) => {
  await page.goto("/design/");
  await page.getByRole("button", { name: "Replay illustration" }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect
    .poll(
      () =>
        page
          .locator("[data-frame-layer]")
          .evaluateAll(
            (elements) =>
              elements
                .flatMap((element) => element.getAnimations())
                .filter((a) => a.playState === "running").length,
          ),
      { timeout: 150, intervals: [10] },
    )
    .toBe(0);
});
