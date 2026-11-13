import { test, expect } from "@playwright/test";
test("visible crop boundary matches the full processed preview at phone and laptop sizes", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/harness/capture-guide.html");
    const preview = page.getByLabel("Live object camera preview");
    const actual = await preview.boundingBox();
    const boundary = await page
      .locator('section[aria-label="Object capture"] div.pointer-events-none')
      .boundingBox();
    expect(actual).not.toBeNull();
    expect(boundary).not.toBeNull();
    for (const key of ["x", "y", "width", "height"] as const)
      expect(Math.abs(actual![key] - boundary![key])).toBeLessThanOrEqual(1);
  }
});
