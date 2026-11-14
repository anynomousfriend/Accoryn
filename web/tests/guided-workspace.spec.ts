import { test, expect } from "@playwright/test";

test("the first mobile action is visible without hunting below the fold", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/treasury/");
  await expect(
    page.getByRole("button", { name: "Start browser session", exact: true }),
  ).toBeInViewport();
});

test("home starts the account journey and exposes one task at a time", async ({
  page,
}) => {
  await page.goto("/treasury/");
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("New username", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create testnet account", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Start browser session", exact: true })
    .click();
  await page.getByLabel("New username", { exact: true }).fill("alice");
  // Writes are intentionally disabled in the normal automated build.
  await expect(
    page.getByText("Account setup session active", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Complete next member list", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign member approval", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByLabel("Treasury account", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("New username", { exact: true }),
  ).not.toBeVisible();
});

test("vault creation reveals its questions in order, without modals", async ({
  page,
}) => {
  await page.goto("/treasury/#vault");
  await page
    .getByRole("button", { name: "Create a vault", exact: true })
    .click();
  await page.getByLabel("Team name", { exact: true }).fill("Studio");
  await expect(
    page.getByLabel("Member usernames", { exact: false }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Next: members", exact: true })
    .click();
  await page.getByText("Enter member IDs manually", { exact: true }).click();
  await page
    .getByLabel("Member usernames", { exact: false })
    .fill("alice.testnet\nbob.testnet");
  await page.getByRole("button", { name: "Review vault", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review your vault", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("alice.testnet", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Create shared vault — 6 testnet NEAR",
      exact: true,
    }),
  ).toBeDisabled();
});

test("member object and approvals explain missing prerequisites without exposing an enabled signature", async ({
  page,
}) => {
  await page.goto("/treasury/#object");
  await expect(
    page.getByText("Sign in with your object on the Account page first.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  await page.getByRole("button", { name: "Approvals", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign member approval", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("No payment loaded", { exact: true }),
  ).toBeVisible();
});

test("mobile task navigation fits and preserves a pending request outside its original task", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/treasury/");
  await page.evaluate(() =>
    localStorage.setItem(
      "accoryn.pending-action.v1",
      JSON.stringify({
        version: 1,
        action: {
          requestId: "uncertain-original",
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
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  await page.getByRole("button", { name: "Completed & records", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pending request", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("withdrawing research acknowledgement revokes the parent check", async ({
  page,
}) => {
  await page.goto("/tests/harness/member-object.html");
  await page
    .getByRole("button", {
      name: "Load actual fixture comparison",
      exact: true,
    })
    .click();
  const consent = page.getByLabel("I reviewed this matched scan.", {
    exact: true,
  });
  await consent.check();
  await page
    .getByRole("button", {
      name: "Use matched scan for this payment",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("check-state")).toHaveText("active");
  await consent.uncheck();
  await expect(page.getByTestId("check-state")).toHaveText("inactive");
  await expect(
    page.getByRole("button", {
      name: "Use matched scan for this payment",
      exact: true,
    }),
  ).toBeDisabled();
});

test("blocked browser storage does not crash the workspace", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
    Storage.prototype.removeItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
  });
  await page.goto("/treasury/");
  await expect(
    page.getByRole("heading", {
      name: "Your account",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Protected action storage is damaged",
  );
});

test("real DINOv2 cup match can continue but a different bottle blocks continuation and revokes the prior check", async ({
  page,
}) => {
  await page.goto("/tests/harness/member-object.html");
  await page
    .getByRole("button", {
      name: "Load actual fixture comparison",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Match", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("I reviewed this matched scan.", { exact: true })
    .check();
  const continuation = page.getByRole("button", {
    name: "Use matched scan for this payment",
    exact: true,
  });
  await continuation.click();
  await expect(page.getByTestId("check-state")).toHaveText("active");
  await page
    .getByRole("button", {
      name: "Load different-object comparison",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "No match", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("I reviewed this matched scan.", { exact: true }),
  ).toBeDisabled();
  await expect(continuation).toBeDisabled();
  await expect(page.getByTestId("check-state")).toHaveText("inactive");
});

test("a saved local key cannot sign until its own object is registered and matched", async ({
  page,
}) => {
  // Real IndexedDB keystore record (pending, no network); no camera is used.
  const id = "accoryn-object-signin.testnet";
  await page.goto("/tests/harness/near-keystore.html");
  await page.waitForFunction(() => !!(window as any).nearKeystoreHarness, {}, {
    timeout: 15000,
  });
  await page.evaluate(
    (account) => (window as any).nearKeystoreHarness.prepare(account),
    id,
  );
  await page.goto("/treasury/#account");
  await page
    .getByRole("button", { name: "Use saved account", exact: true })
    .click();
  await page.getByLabel("Local account", { exact: true }).selectOption(id);
  await expect(
    page.getByRole("heading", { name: "Sign in with your object." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start registration", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Signed out", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start browser session", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No account selected", { exact: true }),
  ).toBeVisible();
});

test("the overview offers your vaults and waiting payments instead of asking for IDs", async ({
  page,
}) => {
  await page.goto("/treasury/#vault");
  await expect(
    page.getByRole("heading", { name: "Your vaults and payments" }),
  ).toBeVisible();
  const panel = (heading: string) =>
    page.locator("section.workspace-panel", {
      has: page.getByRole("heading", { name: heading }),
    });
  // Discovery runs for the signed-in account only.
  await expect(
    panel("Your vaults and payments").getByText(
      /Sign in with your object to see the vaults you belong to/,
    ),
  ).toBeVisible();
  await page.goto("/treasury/#approvals");
  await expect(
    panel("Payment review and approvals").getByText(
      /Sign in with your object to see the vaults you belong to/,
    ),
  ).toBeVisible();
});
