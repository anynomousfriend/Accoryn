import { test, expect } from "@playwright/test";
test("registration is idle without camera access; cancel during real model loading stays stopped", async ({
  page,
}) => {
  await page.goto("/tests/harness/registration.html");
  await page.waitForFunction(() => !!(window as any).registrationHarness);
  const result = await page.evaluate(async () => {
    const c = (window as any).registrationHarness.controller;
    await c.initialize();
    const initial = c.getSnapshot();
    const starting = c.startEnrollment();
    c.cancel();
    await starting;
    return {
      initial,
      after: c.getSnapshot(),
      camera: (
        await navigator.permissions.query({ name: "camera" as PermissionName })
      ).state,
    };
  });
  expect(result.initial.phase).toBe("idle");
  expect(result.initial.previews).toEqual([]);
  expect(result.after.phase).toBe("stopped");
  expect(result.after.previews).toEqual([]);
  expect(result.camera).toBe("prompt");
});
test("a native camera denial permits retry and cannot create enrollment views", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Browser.setPermission", {
    permission: { name: "camera" },
    setting: "denied",
    origin: "http://127.0.0.1:5173",
  });
  await page.goto("/tests/harness/registration.html");
  await page.waitForFunction(() => !!(window as any).registrationHarness);
  const states = await page.evaluate(async () => {
    const c = (window as any).registrationHarness.controller;
    await c.initialize();
    await c.startEnrollment();
    const first = c.getSnapshot();
    await c.startEnrollment();
    return { first, second: c.getSnapshot() };
  });
  for (const s of [states.first, states.second]) {
    expect(s.phase).toBe("error");
    expect(s.detail).toMatch(/permission|camera|available/i);
    expect(s.previews).toEqual([]);
    expect(s.template).toBeNull();
  }
});
test("saving without real completed views or a fresh comparison never succeeds", async ({
  page,
}) => {
  await page.goto("/tests/harness/registration.html");
  await page.waitForFunction(() => !!(window as any).registrationHarness);
  const result = await page.evaluate(async () => {
    const h = (window as any).registrationHarness;
    await h.controller.initialize();
    await h.controller.save("Object", true);
    return { state: h.controller.getSnapshot(), stored: await h.store.read() };
  });
  expect(result.state.phase).toBe("error");
  expect(result.stored).toBeNull();
});
test("starting during the initial storage read cannot bypass an existing registration", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/tests/harness/registration.html");
  await page.waitForFunction(() => !!(window as any).registrationHarness);
  const result = await page.evaluate(async () => {
    const h = (window as any).registrationHarness;
    await h.store.save(
      await h.makeTemplate("Existing object"),
      new AbortController().signal,
    );
    const reading = h.controller.initialize();
    const starting = h.controller.startEnrollment();
    await reading;
    await starting;
    const snapshot = h.controller.getSnapshot();
    h.controller.cancel();
    return snapshot;
  });
  expect(result.phase).toBe("saved");
  expect(result.template?.label).toBe("Existing object");
});
