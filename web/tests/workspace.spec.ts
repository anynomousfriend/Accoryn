import { test, expect } from "@playwright/test";
test("standalone object research returns to the connected account journey", async ({
  page,
}) => {
  await page.goto("/object-registration/");
  await page
    .getByRole("link", { name: "Open team treasury", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your team. One shared vault.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create testnet account", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Start browser session", exact: true }),
  ).toBeVisible();
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
  await expect(page.getByRole("status")).toContainText("Local draft deleted");
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

test("saving from a second stale tab preserves the first tabs invoice", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await page.goto("/workspace/");
  await other.goto("/workspace/");
  for (const [tab, reference] of [
    [page, "INV-A"],
    [other, "INV-B"],
  ] as const) {
    await tab.getByLabel("Invoice reference").fill(reference);
    await tab.getByLabel("Treasury account").fill("team.testnet");
    await tab.getByLabel("Recipient account").fill("supplier.testnet");
    await tab.getByLabel("Purpose").fill("Supplies");
    await tab.getByLabel("Due date").fill("2026-11-20");
    await tab.getByLabel("Description 1").fill("Item");
    await tab.getByLabel("Unit amount in NEAR 1").fill("1");
    await tab.getByRole("button", { name: "Save local draft" }).click();
    await expect(tab.getByRole("status")).toContainText("Draft saved");
  }
  await other.reload();
  await expect(other.getByRole("button", { name: "Open INV-A" })).toBeVisible();
  await expect(other.getByRole("button", { name: "Open INV-B" })).toBeVisible();
});
test("damaged invoice storage cannot hide a valid pending action before or after clearing drafts", async ({
  page,
}) => {
  await page.goto("/workspace/");
  await page.evaluate(() => {
    localStorage.setItem("accoryn.payment-drafts.v1", "{invalid");
    localStorage.setItem(
      "accoryn.pending-action.v1",
      JSON.stringify({
        version: 1,
        action: {
          requestId: "preserve-action",
          kind: "executeProposal",
          treasuryId: "team.testnet",
          draftId: "draft-1",
          proposalId: "42",
          startedAt: "2026-11-13T00:00:00.000Z",
        },
      }),
    );
  });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Pending action requires reconciliation",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear local drafts" }).click();
  await page.getByRole("button", { name: "Confirm clearing drafts" }).click();
  await expect(
    page.getByText("executeProposal · preserve-action"),
  ).toBeVisible();
});

test("submitted references remain discoverable after clearing all local drafts", async ({
  page,
}) => {
  await page.goto("/workspace/");
  await page.evaluate(() =>
    localStorage.setItem(
      "accoryn.proposal-refs.v1",
      JSON.stringify({
        version: 1,
        refs: [
          {
            draftId: "old-draft",
            treasuryId: "team.testnet",
            proposalId: "retained-proposal",
            contentHash: "hash-1",
          },
        ],
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Clear local drafts" }).click();
  await page.getByRole("button", { name: "Confirm clearing drafts" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Open submitted proposal retained-proposal" })
    .click();
  await expect(page.getByLabel("Existing proposal ID")).toHaveValue(
    "retained-proposal",
  );
});

test("independent proposal review displays canonical treasury, purpose, network and exact amount", async ({
  page,
}) => {
  await page.goto("/tests/harness/proposal-review.html");
  for (const value of [
    "canonical-team.testnet",
    "Canonical engine payment purpose",
    "testnet",
    "Native NEAR",
    "1.000000000000000000000001 NEAR",
    "1000000000000000000000001",
  ])
    await expect(page.getByText(value, { exact: true })).toBeVisible();
});

test("workspace section selection remains readable during the immediate color change", async ({
  page,
}) => {
  await page.goto("/workspace/");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const ratio = await page
    .getByRole("button", { name: "Account", exact: true })
    .evaluate((el) => {
      const style = getComputedStyle(el);
      const luminance = (color: string) => {
        const values = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      };
      const fg = luminance(style.color),
        bg = luminance(style.backgroundColor);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test("a stale edit cannot resurrect a draft deleted in another tab", async ({
  page,
  context,
}) => {
  await page.goto("/workspace/");
  for (const [label, value] of [
    ["Invoice reference", "INV-conflict"],
    ["Treasury account", "team.testnet"],
    ["Recipient account", "supplier.testnet"],
    ["Purpose", "Supplies"],
    ["Due date", "2026-11-20"],
    ["Description 1", "Item"],
    ["Unit amount in NEAR 1", "1"],
  ])
    await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save local draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const other = await context.newPage();
  await other.goto("/workspace/");
  await other.getByRole("button", { name: "Open INV-conflict" }).click();
  await page.getByRole("button", { name: "Delete selected draft" }).click();
  await page.getByRole("button", { name: "Confirm draft deletion" }).click();
  await expect(page.getByRole("status")).toContainText("Local draft deleted");
  await other.getByLabel("Purpose").fill("Stale edit");
  await other.getByRole("button", { name: "Save local draft" }).click();
  await expect(other.getByRole("alert")).toContainText("another tab");
  await other.reload();
  await expect(
    other.getByRole("button", { name: "Open INV-conflict" }),
  ).toHaveCount(0);
});

test("native action-record acquisition is exclusive across two tabs", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await page.goto("/workspace/");
  await other.goto("/workspace/");
  const attempt = (tab: typeof page, requestId: string) =>
    tab.evaluate(async (requestId) => {
      const { beginAction } = await import(
        String("/src/workspace/action-journal.ts")
      );
      try {
        await beginAction({
          requestId,
          kind: "createTreasury",
          treasuryId: "unassigned",
          draftId: null,
          proposalId: null,
          startedAt: "2026-11-13T00:00:00.000Z",
        });
        return true;
      } catch {
        return false;
      }
    }, requestId);
  const acquired = await Promise.all([
    attempt(page, "request-A"),
    attempt(other, "request-B"),
  ]);
  expect(acquired.filter(Boolean)).toHaveLength(1);
  const recorded = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("accoryn.pending-action.v1")!).action
        .requestId,
  );
  expect(["request-A", "request-B"]).toContain(recorded);
});
