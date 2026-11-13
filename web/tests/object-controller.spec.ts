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

test('cancel during initial storage lookup still discovers the existing registration', async ({page}) => {
 await page.goto('/tests/harness/registration.html');await page.waitForFunction(()=>!!(window as any).registrationHarness);
 const result=await page.evaluate(async()=>{
  const h=(window as any).registrationHarness;await h.store.save(await h.makeTemplate('Preserved object'),new AbortController().signal);
  const reading=h.controller.initialize();h.controller.cancel();await reading;
  await h.controller.startEnrollment();return h.controller.getSnapshot();
 });
 expect(result.template?.label).toBe('Preserved object');
});

test('save retries real retained fixture views after a validation failure',async({page})=>{
 await page.goto('/tests/harness/registration.html');await page.waitForFunction(()=>!!(window as any).registrationHarness);
 const result=await page.evaluate(async()=>{
  const h=(window as any).registrationHarness;const t=await h.makeTemplate('Fixture');const c=h.controller;await c.initialize();
  // Controller-state integration fixture, not a simulated live camera or model response.
  Object.assign(c,{vectors:t.views,model:t.model,abort:new AbortController(),state:{...c.getSnapshot(),phase:'review',mode:'enrollment',previews:[],viewIndex:3}});
  await c.save('',true);const failed=c.getSnapshot().phase;await c.save('Retry succeeds',true);return {failed,state:c.getSnapshot(),stored:await h.store.read()};
 });
 expect(result.failed).toBe('error');expect(result.state.phase).toBe('saved');expect(result.stored.label).toBe('Retry succeeds');
});
test('cancel reconciles an actually deleted native record before an immediate new action',async({page})=>{
 await page.goto('/tests/harness/registration.html');await page.waitForFunction(()=>!!(window as any).registrationHarness);
 const result=await page.evaluate(async()=>{
  const h=(window as any).registrationHarness;await h.store.save(await h.makeTemplate('Delete me'),new AbortController().signal);await h.controller.initialize();
  await h.store.delete(new AbortController().signal);h.controller.cancel();await h.controller.startComparison();return h.controller.getSnapshot();
 });
 expect(result.template).toBeNull();expect(result.comparison).toBeNull();
});
test('stale stream cleanup preserves the current native media session',async({page})=>{
 await page.goto('/tests/harness/registration.html');
 const result=await page.evaluate(async()=>{
  const {releaseCameraStream}=await import(String('/src/object-registration/camera-resources.ts'));
  const audio=new AudioContext();const old=audio.createMediaStreamDestination().stream;const current=audio.createMediaStreamDestination().stream;
  const video=document.createElement('video');video.srcObject=current;
  const retained=releaseCameraStream(old,current,video);const result={retained:retained===current,attached:video.srcObject===current,live:current.getTracks()[0].readyState,old:old.getTracks()[0].readyState};
  current.getTracks().forEach(t=>t.stop());await audio.close();return result;
 });
 expect(result).toEqual({retained:true,attached:true,live:'live',old:'ended'});
});
