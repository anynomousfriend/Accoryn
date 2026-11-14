import { test, expect } from "@playwright/test";
test("real inferred templates isolate two members and vaults without overwriting legacy registration", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/tests/harness/registration.html");
  await page.waitForFunction(() => !!(window as any).registrationHarness);
  const result = await page.evaluate(async () => {
    const { TemplateStore } = await import(String("/src/object-registration/template-store.ts"));
    const { memberTemplateKey } = await import(String("/src/engines/app/member-object.ts"));
    const h = (window as any).registrationHarness;
    const template = await h.makeTemplate("Legacy cup");
    const a = new TemplateStore(memberTemplateKey("team.sputnikv2.testnet", "alice.testnet"));
    const b = new TemplateStore(memberTemplateKey("team.sputnikv2.testnet", "bob.testnet"));
    const other = new TemplateStore(memberTemplateKey("other.sputnikv2.testnet", "alice.testnet"));
    try {
      await h.store.save(template, new AbortController().signal);
      await a.save({ ...template, id:crypto.randomUUID(), label:"Alice cup" }, new AbortController().signal);
      const before = { legacy:await h.store.read(), alice:await a.read(), bob:await b.read(), other:await other.read() };
      await b.save({ ...template, id:crypto.randomUUID(), label:"Bob cup" }, new AbortController().signal);
      await a.delete(new AbortController().signal);
      return {before, alice:await a.read(), bob:await b.read(), legacy:await h.store.read()};
    } finally { a.close(); b.close(); other.close(); await h.dispose(); }
  });
  expect(result.before.alice.label).toBe("Alice cup");
  expect(result.before.legacy.label).toBe("Legacy cup");
  expect(result.before.bob).toBeNull();
  expect(result.before.other).toBeNull();
  expect(result.alice).toBeNull();
  expect(result.bob.label).toBe("Bob cup");
  expect(result.legacy.label).toBe("Legacy cup");
});
test("real fixture templates persist across reload, reject extra fields, abort replacement and delete", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/tests/harness/registration.html");
  await page.waitForFunction(
    () => !!(window as any).registrationHarness,
    {},
    { timeout: 10000 },
  );
  const first = await page.evaluate(async () => {
    const h = (window as any).registrationHarness;
    const value = await h.makeTemplate("First object");
    await h.store.save(value, new AbortController().signal);
    return value.id;
  });
  await page.reload();
  await page.waitForFunction(() => !!(window as any).registrationHarness);
  const actual = await page.evaluate(async () => {
    const h = (window as any).registrationHarness;
    const original = await h.store.read();
    const replacement = {
      ...original,
      id: crypto.randomUUID(),
      label: "Replacement",
    };
    // Abort after the actual native transaction starts, before commit.
    const ac = new AbortController();
    const pending = h.store.save(replacement, ac.signal);
    queueMicrotask(() => ac.abort());
    let replacementError = "";
    try {
      await pending;
    } catch (e) {
      replacementError = (e as Error).name;
    }
    let extraRejected = false;
    try {
      await h.store.save(
        { ...original, photo: "private" },
        new AbortController().signal,
      );
    } catch {
      extraRejected = true;
    }
    const preserved = await h.store.read();
    await h.store.delete(new AbortController().signal);
    return {
      original,
      preserved,
      deleted: await h.store.read(),
      replacementError,
      extraRejected,
    };
  });
  expect(actual.original.id).toBe(first);
  expect(Object.keys(actual.original).sort()).toEqual([
    "createdAt",
    "id",
    "label",
    "model",
    "schemaVersion",
    "views",
  ]);
  expect(actual.preserved.id).toBe(first);
  expect(actual.replacementError).toBe("AbortError");
  expect(actual.extraRejected).toBe(true);
  expect(actual.deleted).toBeNull();
  await page.reload();
  await page.waitForFunction(() => !!(window as any).registrationHarness);
  expect(
    await page.evaluate(() => (window as any).registrationHarness.store.read()),
  ).toBeNull();
});
test("a corrupt native record is actionable, never silently replaced, and can be explicitly deleted", async ({
  page,
}) => {
  await page.goto("/tests/harness/registration.html");
  await page.waitForFunction(() => !!(window as any).registrationHarness);
  const result = await page.evaluate(async () => {
    const h = (window as any).registrationHarness;
    await h.store.read();
    await h.corrupt();
    await h.controller.initialize();
    const snapshot = h.controller.getSnapshot();
    await h.controller.deleteRegistration();
    return {
      snapshot,
      after: h.controller.getSnapshot(),
      stored: await h.store.read(),
    };
  });
  expect(result.snapshot.phase).toBe("error");
  expect(result.snapshot.detail).toMatch(
    /registration|template|compatible|delete/i,
  );
  expect(result.stored).toBeNull();
  expect(result.after.template).toBeNull();
});
