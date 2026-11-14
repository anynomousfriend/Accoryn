// Opt-in REAL TESTNET spending + physical built-in camera/speaker/microphone.
// The camera records this machine's scene; automation cannot rotate a personal
// object or validate instance recognition. No fake media, signing keys or photos
// are exported, and traces are disabled.
import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
test.use({
  actionTimeout: 30000,
  headless: process.env.ACCORYN_LIVE_APP === "1" ? false : true,
  trace: "off",
});
test("real guided account → member object → vault invoice → acoustic approvals → verified payout", async ({
  browser,
}) => {
  test.skip(
    process.env.ACCORYN_LIVE_APP !== "1",
    "Opt in to testnet spending and physical sensors.",
  );
  test.setTimeout(600000);
  const stamp = Date.now().toString(36),
    alice = `ac-${stamp}-a`,
    bob = `ac-${stamp}-b`;
  const a = await browser.newContext({ permissions: ["camera", "microphone"] });
  const b = await browser.newContext({ permissions: ["camera", "microphone"] });
  const p = await a.newPage(),
    q = await b.newPage();
  const evidence: { stage: string; value?: string }[] = [];
  async function checkpoint(stage: string, value?: string) {
    evidence.push({ stage, value });
    console.log("LIVE APP:", stage, value ?? "");
    await mkdir(".local/integration", { recursive: true });
    await writeFile(
      ".local/integration/live-guided-browser.json",
      JSON.stringify(evidence, null, 2),
    );
  }
  const status = (page: Page) => page.locator("#workspace-status");
  async function success(page: Page) {
    await expect(
      page.getByRole("button", { name: "Stop current operation", exact: true }),
    ).toHaveCount(0, { timeout: 90000 });
    await expect(status(page)).toContainText(/^Action outcome: confirmed\./, {
      timeout: 90000,
    });
    await expect(
      page.getByRole("heading", { name: "Pending request", exact: true }),
    ).toHaveCount(0);
  }
  const task = (page: Page, name: string) =>
    page
      .getByRole("navigation", { name: "Workspace tasks" })
      .getByRole("button", { name, exact: true })
      .click();
  async function enrollCamera(page: Page) {
    await task(page, "Member object");
    await page
      .getByRole("button", { name: "Start registration", exact: true })
      .click();
    for (let i = 0; i < 3; i++) {
      const capture = page.getByRole("button", {
        name: "Capture view",
        exact: true,
      });
      await expect(capture).toBeVisible({ timeout: 60000 });
      await page.waitForFunction(() => {
        const video = document.querySelector("video");
        return video && video.readyState >= 2 && video.videoWidth > 0;
      });
      await capture.click();
      await page
        .getByRole("button", { name: "Use this view", exact: true })
        .click();
    }
    await page
      .getByLabel("Object label", { exact: true })
      .fill("Physical camera scene integration");
    await page
      .getByRole("button", { name: "Save visual template", exact: true })
      .click();
    await expect(
      page.getByText("Visual template saved locally. Photos discarded.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Continue to payment", exact: true })
      .click();
  }
  async function freshCamera(page: Page) {
    await page
      .getByRole("button", { name: "Compare a fresh scan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Capture fresh scan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Compare this scan", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Scan compared · identity unproven",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByLabel(
        "I reviewed the fresh scan and accept a manual research continuation.",
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", {
        name: "Use this research check for this payment",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Research check active · identity unproven", {
        exact: true,
      }),
    ).toBeVisible();
  }
  try {
    for (const [page, name] of [
      [p, alice],
      [q, bob],
    ] as const) {
      await page.goto("/");
      await page
        .getByRole("button", { name: "Start browser session", exact: true })
        .click();
      await page.getByLabel("New username", { exact: true }).fill(name);
      await page
        .getByRole("button", { name: "Create testnet account", exact: true })
        .click();
      await success(page);
      await checkpoint("account", `${name}.testnet`);
    }
    await p
      .getByRole("button", { name: "Create a vault", exact: true })
      .click();
    await p.getByLabel("Team name", { exact: true }).fill("Guided Integration");
    await p.getByRole("button", { name: "Next: members", exact: true }).click();
    await p
      .getByLabel("Member usernames", { exact: false })
      .fill(`${bob}.testnet`);
    await p.getByRole("button", { name: "Review vault", exact: true }).click();
    await p
      .getByRole("button", {
        name: "Create shared vault — 6 testnet NEAR",
        exact: true,
      })
      .click();
    await success(p);
    await task(p, "Vault");
    const dao = await p
      .getByLabel("Treasury account", { exact: true })
      .inputValue();
    await checkpoint("vault", dao);
    await enrollCamera(p);
    await checkpoint("host enrollment through real camera");
    await task(p, "Vault");
    await p
      .getByRole("button", { name: "Fund loaded vault", exact: true })
      .click();
    await success(p);
    await checkpoint("funded");
    await q.getByLabel("Treasury account", { exact: true }).fill(dao);
    await q.getByRole("button", { name: "Load treasury", exact: true }).click();
    await expect(status(q)).toContainText("loaded", { timeout: 30000 });
    await enrollCamera(q);
    await checkpoint("listener enrollment through real camera");
    await task(p, "Payment");
    await p.getByRole("button", { name: "New invoice", exact: true }).click();
    const editor = p.getByRole("region", {
      name: "Prepare invoice payment",
      exact: true,
    });
    await editor
      .getByLabel("Recipient account", { exact: true })
      .fill(`${bob}.testnet`);
    await editor
      .getByLabel("Purpose", { exact: true })
      .fill("Live guided flow payout");
    await editor.getByLabel("Amount in NEAR", { exact: true }).fill("0.05");
    await editor
      .getByRole("button", { name: "Save local draft", exact: true })
      .click();
    await expect(status(p)).toContainText("Draft saved");
    await p
      .getByLabel(
        "I reviewed the exact native NEAR payment and loaded vault.",
        { exact: true },
      )
      .check();
    await p
      .getByRole("button", {
        name: "Submit reviewed invoice proposal",
        exact: true,
      })
      .click();
    await success(p);
    await checkpoint("proposal", "0");
    await p
      .getByRole("button", {
        name: "Open host session — 0.1 testnet NEAR",
        exact: true,
      })
      .click();
    await success(p);
    await checkpoint("session opened");
    await task(q, "Approvals");
    await q.getByLabel("Transfer proposal ID", { exact: true }).fill("0");
    await q
      .getByRole("button", {
        name: "Refresh payment and ceremony",
        exact: true,
      })
      .click();
    await expect(status(q)).toContainText("loaded", { timeout: 30000 });
    for (const page of [p, q]) {
      await expect(
        page.getByRole("button", { name: "Sign member approval", exact: true }),
      ).toBeDisabled();
      await freshCamera(page);
    }
    await q
      .getByRole("button", { name: "Listen to host sound", exact: true })
      .click();
    await expect(status(q)).toContainText(/Listening|microphone|Waiting/, {
      timeout: 30000,
    });
    await p
      .getByRole("button", { name: "Play host sound", exact: true })
      .click();
    for (const page of [p, q])
      await expect(status(page)).toContainText("Sound exchange ready", {
        timeout: 50000,
      });
    await checkpoint("physical sound received");
    for (const page of [p, q]) {
      await page
        .getByLabel(
          "I approve this exact recipient, amount and purpose as a vault member.",
          { exact: true },
        )
        .check();
      await page
        .getByRole("button", { name: "Sign member approval", exact: true })
        .click();
      await success(page);
    }
    await p
      .getByRole("button", {
        name: "Refresh payment and ceremony",
        exact: true,
      })
      .click();
    await expect(status(p)).toContainText("loaded", { timeout: 30000 });
    await checkpoint("two member approvals");
    await q
      .getByRole("button", { name: "Execute approved payment", exact: true })
      .click();
    await success(q);
    await checkpoint(
      "executed",
      (await q
        .getByRole("link", { name: /View transaction/ })
        .getAttribute("href")) ?? "",
    );
    await q
      .getByRole("button", {
        name: "Publish verified payout evidence",
        exact: true,
      })
      .click();
    await success(q);
    await task(q, "Activity");
    await q
      .getByRole("button", { name: "Load chain receipts", exact: true })
      .click();
    await expect(q.getByText(/#0 · settled/)).toBeVisible({ timeout: 60000 });
    await checkpoint("settled receipt verified");
  } finally {
    await a.close();
    await b.close();
  }
});
