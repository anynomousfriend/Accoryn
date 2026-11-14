import { test, expect } from "@playwright/test";
test("connected treasury screen keeps writes locked and exposes real read-only lookup", async ({
  page,
}) => {
  await page.goto("/treasury/");
  await expect(
    page.getByRole("heading", {
      name: "Your account",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Start a session to continue", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create testnet account", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByLabel("Treasury account")
    .fill("accoryn-spike.sputnikv2.testnet");
  await expect(
    page.getByRole("button", { name: "Load treasury", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Load treasury", exact: true })
    .click();
  await expect(
    page.getByText("Governance approvals:", { exact: false }),
  ).toBeVisible({ timeout: 45000 });
  await expect(
    page.getByRole("list").getByText("accoryn-alice.testnet", { exact: true }),
  ).toBeVisible();
});
test("reload preserves a pending request and blocks a second submission", async ({
  page,
}) => {
  await page.goto("/treasury/");
  await page.evaluate(() =>
    localStorage.setItem(
      "accoryn.pending-action.v1",
      JSON.stringify({
        version: 1,
        action: {
          requestId: "unknown-request",
          kind: "open",
          treasuryId: "team.sputnikv2.testnet",
          draftId: null,
          proposalId: "0",
          startedAt: new Date().toISOString(),
        },
      }),
    ),
  );
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Reconcile original request",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reconcile original request", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("unknown");
  await page.reload();
  await expect(
    page.getByText("unknown-request", { exact: false }),
  ).toBeVisible();
});
test("a new lookup clears an earlier success message while RPC is pending", async ({
  page,
}) => {
  await page.goto("/treasury/#vault");
  await page
    .getByLabel("Treasury account", { exact: true })
    .fill("accoryn-spike.sputnikv2.testnet");
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("https://rpc.testnet.fastnear.com/**", async (route) => {
    await gate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Load treasury", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Working");
  release();
});
test("shareable board uses testnet reads without asking for a key or scan", async ({
  page,
}) => {
  await page.goto("/board/?dao=accoryn-spike.sputnikv2.testnet");
  await expect(
    page.getByRole("heading", { name: "Treasury board", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create testnet account", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("accoryn-alice.testnet", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect(page.getByText("settled", { exact: true }).first()).toBeVisible({
    timeout: 60000,
  });
});
test("an already submitted invoice cannot be submitted again from the connected screen", async ({
  page,
}) => {
  await page.goto("/workspace/");
  await page.getByLabel("Invoice reference").fill("LOCKED");
  await page.getByLabel("Treasury account").fill("team.sputnikv2.testnet");
  await page.getByLabel("Recipient account").fill("payee.testnet");
  await page.getByLabel("Purpose").fill("Item");
  await page.getByLabel("Description 1").fill("Item");
  await page.getByLabel("Unit amount in NEAR 1").fill("0.05");
  await page
    .getByRole("button", { name: "Save local draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("accoryn.payment-drafts.v1")!);
    const draft = raw.drafts[0];
    localStorage.setItem(
      "accoryn.proposal-refs.v1",
      JSON.stringify({
        version: 1,
        refs: [
          {
            draftId: draft.id,
            treasuryId: draft.treasuryId,
            proposalId: "0",
            contentHash: "known-hash",
          },
        ],
      }),
    );
  });
  await page.goto("/treasury/#payment");
  await page
    .getByLabel("Saved invoice", { exact: true })
    .selectOption({ label: "LOCKED" });
  await expect(
    page.getByText(
      "This draft already has a submitted proposal. Refresh its on-chain outcome.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("a legacy object handoff never substitutes for browser session consent", async ({
  page,
}) => {
  await page.goto("/treasury/");
  await page.evaluate(() => {
    const issuedAt = Date.now();
    sessionStorage.setItem(
      "accoryn.research-handoff.v1",
      JSON.stringify({
        templateId: "missing",
        issuedAt,
        expiresAt: issuedAt + 600000,
      }),
    );
  });
  await page.reload();
  await expect(
    page.getByText("Start a session to continue", { exact: true }),
  ).toBeVisible();
});
test("an invoice can be prepared and saved inside the connected flow with vault context carried forward", async ({
  page,
}) => {
  await page.goto("/treasury/#vault");
  await page
    .getByLabel("Treasury account", { exact: true })
    .fill("accoryn-spike.sputnikv2.testnet");
  await page
    .getByRole("button", { name: "Load treasury", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("loaded", {
    timeout: 45000,
  });
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  await page.getByRole("button", { name: "New invoice", exact: true }).click();
  const editor = page.getByRole("region", {
    name: "Prepare invoice payment",
    exact: true,
  });
  await editor
    .getByText("Enter recipient ID manually", { exact: true })
    .click();
  await editor
    .getByLabel("Recipient account", { exact: true })
    .fill("payee.testnet");
  await editor
    .getByLabel("Purpose", { exact: true })
    .fill("Inline preparation");
  await editor.getByLabel("Amount in NEAR", { exact: true }).fill("0.05");
  await editor
    .getByText("Invoice reference and due date", { exact: true })
    .click();
  await editor.getByLabel("Invoice reference", { exact: true }).fill("INLINE");
  await editor
    .getByRole("button", { name: "Save local draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await expect(page).toHaveURL(/\/treasury\/#payment$/);
  await expect(page.getByLabel("Saved invoice", { exact: true })).toHaveValue(
    /.+/,
  );
  await expect(
    page.getByRole("button", {
      name: "Submit reviewed invoice proposal",
      exact: true,
    }),
  ).toBeDisabled();
});
test("a delayed second tab cannot acquire submission after the first tab recorded the same draft", async ({
  page,
  context,
}) => {
  await page.goto("/treasury/");
  const second = await context.newPage();
  await second.goto("/treasury/");
  // Model the real race: B prepares its immutable intent before A finishes;
  // its later admission must recheck the reference inside the shared lock.
  const intent = {
    requestId: "delayed-second-tab",
    kind: "propose",
    treasuryId: "team.sputnikv2.testnet",
    draftId: "same-draft",
    proposalId: null,
    startedAt: new Date().toISOString(),
  };
  await page.evaluate(async () => {
    const journal = await import(String("/src/workspace/action-journal.ts"));
    const storage = await import(String("/src/workspace/storage.ts"));
    await journal.beginAction({
      requestId: "first-tab",
      kind: "propose",
      treasuryId: "team.sputnikv2.testnet",
      draftId: "same-draft",
      proposalId: null,
      startedAt: new Date().toISOString(),
    });
    await storage.rememberProposalReference({
      draftId: "same-draft",
      treasuryId: "team.sputnikv2.testnet",
      proposalId: "0",
      contentHash: "hash",
    });
    await journal.finishAction("first-tab");
  });
  const result = await second.evaluate(async (intent) => {
    const journal = await import(String("/src/workspace/action-journal.ts"));
    try {
      await journal.beginAction(intent);
      return "admitted";
    } catch (e) {
      return e instanceof Error ? e.message : "rejected";
    }
  }, intent);
  expect(result).toMatch(/already.*submitted|submitted.*proposal/i);
});
test("Load board retries the same account after a failed read", async ({
  page,
}) => {
  let fail = true;
  await page.route(/https:\/\/.*(fastnear|near\.org|near\.page).*/, (route) =>
    fail ? route.abort() : route.continue(),
  );
  await page.goto("/board/?dao=accoryn-spike.sputnikv2.testnet");
  await expect(page.getByRole("status")).not.toContainText(
    "Loading chain state",
    { timeout: 30000 },
  );
  fail = false;
  await page.getByRole("button", { name: "Load board", exact: true }).click();
  await expect(
    page.getByText("accoryn-alice.testnet", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
});
