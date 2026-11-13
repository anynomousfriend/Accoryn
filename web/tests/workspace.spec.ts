import { test, expect } from "@playwright/test";
test("object registration connects to a local payment workspace without pretending to create accounts", async ({
  page,
}) => {
  await page.goto("/object-registration/");
  await page.getByRole("link", { name: "Prepare a team payment" }).click();
  await expect(
    page.getByRole("heading", { name: "Team workspace" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Local preparation only. No proposal or payment has been submitted.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account" }).click();
  await expect(
    page.getByRole("button", { name: "Create or access account" }),
  ).toBeDisabled();
  await expect(page.getByText("No account connected.")).toBeVisible();
});
test("invoice drafts save, review exact totals, reload, and delete using real browser storage", async ({
  page,
}) => {
  await page.goto("/workspace/");
  await page.getByLabel("Invoice reference").fill("INV-test");
  await page.getByLabel("Treasury account").fill("team.testnet");
  await page.getByLabel("Recipient account").fill("supplier.testnet");
  await page.getByLabel("Purpose").fill("Equipment");
  await page.getByLabel("Due date").fill("2026-11-20");
  await page.getByLabel("Description 1").fill("Supplies");
  await page.getByLabel("Quantity 1").fill("2");
  await page
    .getByLabel("Unit amount in NEAR 1")
    .fill("1.000000000000000000000001");
  await page.getByRole("button", { name: "Save local draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("button", { name: "Review exact payment" }).click();
  await expect(
    page.getByText("2000000000000000000000002", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit proposal" }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Open INV-test" }).click();
  await expect(page.getByLabel("Invoice reference")).toHaveValue("INV-test");
  await page.getByRole("button", { name: "Delete selected draft" }).click();
  await page.getByRole("button", { name: "Confirm draft deletion" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Open INV-test" })).toHaveCount(
    0,
  );
});
test("acoustic, approvals and receipt screens show unavailable capabilities without fake success", async ({
  page,
}) => {
  await page.goto("/workspace/");
  await page
    .getByRole("button", { name: "Approval session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start acoustic exchange" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Approve exact proposal" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Execute approved payment" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Receipts", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Export reconciled receipts" }),
  ).toBeDisabled();
  await expect(page.getByText("No reconciled receipts loaded.")).toBeVisible();
});
test("workspace stays usable at phone widths", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/workspace/");
    await expect(
      page.getByRole("heading", { name: "Team workspace" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("pending intent survives reload and clearing drafts without allowing another financial command", async ({
  page,
}) => {
  await page.goto("/workspace/");
  await page.evaluate(() =>
    localStorage.setItem(
      "accoryn.pending-action.v1",
      JSON.stringify({
        version: 1,
        action: {
          requestId: "uncertain-request",
          kind: "executeProposal",
          treasuryId: "team.testnet",
          draftId: "draft-1",
          proposalId: "42",
          startedAt: "2026-11-13T00:00:00.000Z",
        },
      }),
    ),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Pending action requires reconciliation",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconcile pending action" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Clear local drafts" }).click();
  await page.getByRole("button", { name: "Confirm clearing drafts" }).click();
  await page.reload();
  await expect(
    page.getByText("executeProposal · uncertain-request"),
  ).toBeVisible();
});
test("corrupt draft storage is not silently overwritten by saving a replacement", async ({
  page,
}) => {
  await page.goto("/workspace/");
  await page.evaluate(() =>
    localStorage.setItem("accoryn.payment-drafts.v1", "{invalid"),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("not overwritten");
  await expect(
    page.getByRole("button", { name: "Save local draft" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("accoryn.payment-drafts.v1"),
    ),
  ).toBe("{invalid");
});

test("a persisted proposal reference locks the original draft after reload", async ({
  page,
}) => {
  await page.goto("/workspace/");
  await page.evaluate(() => {
    const draft = {
      id: "be3eb854-035a-40fe-891f-19897e61abc2",
      reference: "INV-locked",
      treasuryId: "team.testnet",
      recipient: "supplier.testnet",
      purpose: "Supplies",
      dueDate: "2026-11-20",
      lines: [{ description: "Item", quantity: 1, unitAmount: "1" }],
      updatedAt: "2026-11-13T00:00:00.000Z",
    };
    localStorage.setItem(
      "accoryn.payment-drafts.v1",
      JSON.stringify({ version: 1, drafts: [draft] }),
    );
    localStorage.setItem(
      "accoryn.proposal-refs.v1",
      JSON.stringify({
        version: 1,
        refs: [
          {
            draftId: draft.id,
            treasuryId: draft.treasuryId,
            proposalId: "42",
            contentHash: "hash-1",
          },
        ],
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Open INV-locked" }).click();
  await expect(page.getByLabel("Invoice reference")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save local draft" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Review exact payment" }).click();
  await expect(
    page.getByRole("button", { name: "Submit proposal" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "New draft" }).click();
  await expect(page.getByLabel("Invoice reference")).toBeEnabled();
});
