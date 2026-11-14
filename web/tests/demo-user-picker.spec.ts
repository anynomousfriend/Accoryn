import { test, expect, chromium } from "@playwright/test";
import { resolve } from "node:path";
const alice = "accoryn-alice.testnet",
  bob = "accoryn-bob.testnet";
test("a hanging refresh reaches an actionable failure instead of polling forever", async ({
  page,
}) => {
  await page.goto("/treasury/#vault");
  await page
    .getByRole("button", { name: "Create a vault", exact: true })
    .click();
  await page.getByLabel("Team name", { exact: true }).fill("Delayed directory");
  await page
    .getByRole("button", { name: "Next: members", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Refresh demo users", exact: true }),
  ).toBeEnabled();
  await page.route("**/api/demo-users", () => {});
  await page
    .getByRole("button", { name: "Refresh demo users", exact: true })
    .click();
  await expect(page.getByText(/Shared demo list unavailable/)).toBeVisible({
    timeout: 11000,
  });
  await expect(
    page.getByRole("button", { name: "Refresh demo users", exact: true }),
  ).toBeEnabled();
});
test("separate browser sessions share real testnet users for member and recipient selection, never signer keys", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  try {
    const p = await a.newPage(),
      q = await b.newPage();
    await q.goto("/");
    for (const accountId of [alice, bob]) {
      const result = await b.request.post("/api/demo-users", {
        data: { accountId },
      });
      expect(result.status()).toBe(200);
    }
    await p.goto("/treasury/#vault");
    await p
      .getByRole("button", { name: "Create a vault", exact: true })
      .click();
    await p.getByLabel("Team name", { exact: true }).fill("Picker demo");
    await p.getByRole("button", { name: "Next: members", exact: true }).click();
    await p.getByLabel(`Add ${alice}`, { exact: true }).check();
    await p.getByLabel(`Add ${bob}`, { exact: true }).check();
    await p.getByRole("button", { name: "Review vault", exact: true }).click();
    await expect(p.getByText(alice, { exact: true })).toBeVisible();
    await expect(p.getByText(bob, { exact: true })).toBeVisible();
    await p.getByRole("button", { name: "Account", exact: true }).click();
    await expect(
      p.getByLabel("Local account", { exact: true }).locator("option"),
    ).toHaveCount(1);
    await p.getByRole("button", { name: "Overview", exact: true }).click();
    await p.getByRole("button", { name: "Open a vault", exact: true }).click();
    await p
      .getByLabel("Treasury account", { exact: true })
      .fill("accoryn-spike.sputnikv2.testnet");
    await p.getByRole("button", { name: "Load treasury", exact: true }).click();
    await expect(p.locator("#workspace-status")).toContainText("loaded", {
      timeout: 45000,
    });
    await p.getByRole("button", { name: "Payments", exact: true }).click();
    await p.getByRole("button", { name: "New invoice", exact: true }).click();
    await p.getByLabel("Choose recipient", { exact: true }).selectOption(bob);
    await p
      .getByLabel("Purpose", { exact: true })
      .fill("Select without typing IDs");
    await p.getByLabel("Amount in NEAR", { exact: true }).fill("0.05");
    await p
      .getByRole("button", { name: "Save local draft", exact: true })
      .click();
    await expect(p.locator("#workspace-status")).toContainText("Draft saved");
    await expect(p.getByLabel("Choose recipient", { exact: true })).toHaveValue(
      bob,
    );
    await p.route("**/api/demo-users", (r) => r.abort());
    await p
      .getByRole("button", { name: "Refresh demo users", exact: true })
      .click();
    await expect(
      p.getByText(/Shared demo list unavailable/).first(),
    ).toBeVisible();
    await expect(p.getByLabel("Choose recipient", { exact: true })).toHaveValue(
      bob,
    );
    await expect(
      p.getByRole("button", {
        name: "Submit reviewed invoice proposal",
        exact: true,
      }),
    ).toBeDisabled();
    await p.getByRole("button", { name: "Vault settings", exact: true }).click();
    await expect(
      p.getByRole("checkbox", { name: `Add ${alice}`, exact: true }),
    ).toBeChecked();
  } finally {
    await a.close();
    await b.close();
  }
});
test("an unavailable directory offers manual member entry and preserves the selected roster", async ({
  page,
}) => {
  await page.route("**/api/demo-users", (r) => r.abort());
  await page.goto("/treasury/#vault");
  await page
    .getByRole("button", { name: "Create a vault", exact: true })
    .click();
  await page.getByLabel("Team name", { exact: true }).fill("Offline directory");
  await page
    .getByRole("button", { name: "Next: members", exact: true })
    .click();
  await page.getByText("Enter member IDs manually", { exact: true }).click();
  await page
    .getByLabel("Member usernames", { exact: false })
    .fill(`${alice}\n${bob}`);
  await page
    .getByRole("button", { name: "Refresh demo users", exact: true })
    .click();
  await expect(
    page.getByLabel("Member usernames", { exact: false }),
  ).toHaveValue(`${alice}\n${bob}`);
  await page.getByRole("button", { name: "Review vault", exact: true }).click();
  await expect(page.getByText(alice, { exact: true })).toBeVisible();
});

test("existing local testnet account is chain-verified and shares only its public ID through the actual account screen", async ({
  browser,
}) => {
  test.skip(
    process.env.ACCORYN_DEMO_PROFILE !== "1",
    "Opt in to the retained diagnostic browser profile; no testnet spending.",
  );
  test.setTimeout(90000);
  const owner = await chromium.launchPersistentContext(
    resolve(
      import.meta.dirname,
      "../../.local/runtime/account-diagnostic-profile",
    ),
    { channel: "chrome", ignoreHTTPSErrors: true },
  );
  const observer = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = owner.pages()[0] ?? (await owner.newPage());
    const sent: Record<string, unknown>[] = [];
    const responses: number[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/demo-users"
      )
        sent.push(request.postDataJSON());
    });
    page.on("response", (response) => {
      if (
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/demo-users"
      )
        responses.push(response.status());
    });
    await page.goto("https://localhost:5173/");
    await page
      .getByRole("button", { name: "Start browser session", exact: true })
      .click();
    const chooser = page.getByLabel("Local account", { exact: true });
    await expect(chooser.locator("option")).not.toHaveCount(1);
    const id = (await chooser.locator("option").allTextContents()).find(
      (value) => value.endsWith(".testnet"),
    );
    expect(id).toBeTruthy();
    await chooser.selectOption(id!);
    await page
      .getByRole("button", { name: "Use local account", exact: true })
      .click();
    await expect(page.locator("#workspace-status")).toContainText(
      "Local key confirmed",
      { timeout: 45000 },
    );
    await expect
      .poll(() => sent, { timeout: 5000 })
      .toContainEqual({ accountId: id });
    await expect.poll(() => responses, { timeout: 30000 }).toContain(200);
    const other = await observer.newPage();
    await expect
      .poll(
        async () =>
          (
            await (
              await observer.request.get(
                "https://localhost:5173/api/demo-users",
              )
            ).json()
          ).accounts,
        { timeout: 30000 },
      )
      .toContain(id);
    expect(sent).toContainEqual({ accountId: id });
    expect(
      sent.every((value) => Object.keys(value).join("|") === "accountId"),
    ).toBe(true);
    await other.goto("https://localhost:5173/treasury/#vault");
    await other
      .getByRole("button", { name: "Create a vault", exact: true })
      .click();
    await other
      .getByLabel("Team name", { exact: true })
      .fill("Shared selection check");
    await other
      .getByRole("button", { name: "Next: members", exact: true })
      .click();
    await expect(
      other.getByRole("checkbox", { name: `Add ${id}`, exact: true }),
    ).toBeVisible();
    await other.getByRole("button", { name: "Account", exact: true }).click();
    await expect(
      other.getByLabel("Local account", { exact: true }).locator("option"),
    ).toHaveCount(1);
  } finally {
    await owner.close();
    await observer.close();
  }
});
