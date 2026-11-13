// Real browser IndexedDB persistence for the engine keystore and transaction
// journal. Component-level storage tests: no account is created and no
// transaction reaches any network (see tests/harness/near-keystore.ts).
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const open = async (page: Page) => {
  await page.goto("/tests/harness/near-keystore.html");
  await page.waitForFunction(() => !!(window as any).nearKeystoreHarness, {}, { timeout: 15000 });
};
const ID = "accoryn-browser-dana.testnet";

test("keystore records persist across reload and listings never carry secrets", async ({ page }) => {
  await open(page);
  const created = await page.evaluate(async (id) => {
    const h = (window as any).nearKeystoreHarness;
    return { account: await h.prepare(id), signerKey: await h.signerPublicKey(id) };
  }, ID);
  expect(created.account).toEqual({ network: "testnet", accountId: ID, publicKey: created.signerKey, createdAt: expect.any(String), status: "pending" });
  await page.reload();
  await page.waitForFunction(() => !!(window as any).nearKeystoreHarness);
  const after = await page.evaluate(async (id) => {
    const h = (window as any).nearKeystoreHarness;
    const list = await h.list();
    return { list, text: JSON.stringify(list), again: await h.prepare(id), signerKey: await h.signerPublicKey(id) };
  }, ID);
  expect(after.list).toEqual([{ usable: true, account: created.account }]);
  expect(after.text).not.toContain("secretKey");
  expect(after.text).not.toMatch(/ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/);
  expect(after.again).toEqual(created.account);
  expect(after.signerKey).toBe(created.account.publicKey);
});

test("a corrupted key record is reported as unusable and left untouched", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async (id) => {
    const h = (window as any).nearKeystoreHarness;
    await h.prepare(id);
    await h.prepare("accoryn-browser-erin.testnet");
    await h.corruptKey(id);
    const digest = await h.rawKeyDigest(id);
    const list = await h.list();
    return {
      list,
      signerError: await h.signerError(id),
      prepareError: await h.prepareError(id),
      unchanged: (await h.rawKeyDigest(id)) === digest,
    };
  }, ID);
  expect(result.list).toHaveLength(2);
  expect(result.list).toContainEqual({ usable: false, key: ID, problem: expect.any(String) });
  expect(result.list).toContainEqual({ usable: true, account: expect.objectContaining({ accountId: "accoryn-browser-erin.testnet" }) });
  expect(JSON.stringify(result.list)).not.toContain("secretKey");
  expect(result.signerError).toBe("KeystoreRecordError");
  expect(result.prepareError).toBe("KeystoreRecordError");
  expect(result.unchanged).toBe(true);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).nearKeystoreHarness);
  const removed = await page.evaluate(async (id) => {
    const h = (window as any).nearKeystoreHarness;
    await h.remove(id);
    return h.list();
  }, ID);
  expect(removed).toEqual([{ usable: true, account: expect.objectContaining({ accountId: "accoryn-browser-erin.testnet" }) }]);
});

test("journal records persist across reload without re-signing; corrupted ones are reported", async ({ page }) => {
  await open(page);
  const first = await page.evaluate(async () => {
    const h = (window as any).nearKeystoreHarness;
    return h.journalSubmitOffline("browser-req-1");
  });
  expect(first.status).toBe("submitted");
  expect(first.broadcastError).toEqual({ type: "UNAVAILABLE", detail: null });
  await page.reload();
  await page.waitForFunction(() => !!(window as any).nearKeystoreHarness);
  const after = await page.evaluate(async () => {
    const h = (window as any).nearKeystoreHarness;
    const record = await h.journalGet("browser-req-1");
    const resumed = await h.journalSubmitOffline("browser-req-1");
    const reconciled = await h.journalReconcileOffline("browser-req-1");
    await h.journalSubmitOffline("browser-req-2");
    await h.corruptJournal("browser-req-2");
    return { record, resumed, reconciled, list: await h.journalList(), corruptError: await h.journalError("browser-req-2") };
  });
  expect(after.record).toMatchObject({ version: 1, requestId: "browser-req-1", status: "submitted", txHash: first.txHash, nonce: "42" });
  expect(after.resumed).toMatchObject({ txHash: first.txHash, resumed: true, status: "submitted" });
  expect(after.reconciled).toMatchObject({ requestId: "browser-req-1", status: "unknown", txHash: first.txHash });
  expect(after.list).toContainEqual({ usable: true, record: expect.objectContaining({ requestId: "browser-req-1" }) });
  expect(after.list).toContainEqual({ usable: false, requestId: "browser-req-2", problem: expect.any(String) });
  expect(after.corruptError).toBe("TxJournalRecordError");
});
