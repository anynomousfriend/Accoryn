// Opt-in REAL TESTNET spending test. Creates fresh isolated browser keys/accounts.
// Object handoff uses a real DINOv2 template computed from image fixtures, then
// explicit fixture consent. It does NOT establish physical object authentication.
// Audio uses the actual machine speakers/microphone, never a fake stream.
import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
test.use({
  actionTimeout: 30000,
  headless: process.env.ACCORYN_LIVE_APP === "1" ? false : true,
  trace: "off",
});
test("real app account → vault → invoice → member ceremony → verified payout", async ({
  browser,
}) => {
  test.skip(
    process.env.ACCORYN_LIVE_APP !== "1",
    "Opt in to testnet spending and physical audio.",
  );
  test.setTimeout(480000);
  const stamp = Date.now().toString(36),
    alice = `ac-${stamp}-a`,
    bob = `ac-${stamp}-b`;
  const a = await browser.newContext({ permissions: ["microphone"] }),
    b = await browser.newContext({ permissions: ["microphone"] });
  const p = await a.newPage(),
    q = await b.newPage();
  const evidence: { stage: string; value?: string }[] = [];
  async function checkpoint(stage: string, value?: string) {
    evidence.push({ stage, value });
    console.log("LIVE APP:", stage, value ?? "");
    await mkdir(".local/integration", { recursive: true });
    await writeFile(
      ".local/integration/live-browser.json",
      JSON.stringify(evidence, null, 2),
    );
  }
  async function success(page: Page) {
    await expect(
      page.getByRole("button", { name: "Stop current operation", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Stop current operation", exact: true }),
    ).toHaveCount(0, { timeout: 90000 });
    await expect(page.getByRole("status")).toContainText(
      /^Action outcome: confirmed\./,
    );
    await expect(
      page.getByRole("heading", { name: "Pending request", exact: true }),
    ).toHaveCount(0);
  }
  async function research(page: Page) {
    await page.goto("/tests/harness/registration.html");
    await page.evaluate(async () => {
      const harness = (window as any).registrationHarness;
      const template = await harness.makeTemplate("fixture cup");
      await harness.store.save(template, new AbortController().signal);
      sessionStorage.setItem(
        "accoryn.research-handoff.v1",
        JSON.stringify({
          templateId: template.id,
          issuedAt: Date.now(),
          expiresAt: Date.now() + 600000,
        }),
      );
      await harness.dispose();
    });
    await page.goto("/treasury/");
  }
  try {
    for (const [page, name] of [
      [p, alice],
      [q, bob],
    ] as const) {
      await research(page);
      await page.getByLabel("New username", { exact: true }).fill(name);
      await page
        .getByRole("button", { name: "Create testnet account", exact: true })
        .click();
      await success(page);
      await checkpoint("account", `${name}.testnet`);
    }
    await p.getByLabel("Team name", { exact: true }).fill("Integration");
    await p
      .getByLabel("Member usernames", { exact: false })
      .fill(`${alice}.testnet\n${bob}.testnet`);
    await p
      .getByRole("button", {
        name: "Create shared vault — 6 testnet NEAR",
        exact: true,
      })
      .click();
    await success(p);
    const dao = await p
      .getByLabel("Treasury account", { exact: true })
      .inputValue();
    await checkpoint("vault", dao);
    await p
      .getByRole("button", { name: "Fund loaded vault", exact: true })
      .click();
    await success(p);
    await checkpoint("funded");
    // Use the shipped draft editor, not an invented chain proposal.
    const draft = p.context();
    const editor = await draft.newPage();
    await editor.goto("/workspace/");
    await editor
      .getByLabel("Invoice reference", { exact: true })
      .fill("LIVE-INVOICE");
    await editor.getByLabel("Treasury account", { exact: true }).fill(dao);
    await editor
      .getByLabel("Recipient account", { exact: true })
      .fill(`${bob}.testnet`);
    await editor
      .getByLabel("Purpose", { exact: true })
      .fill("Live app integration payout");
    await editor.getByLabel("Description 1", { exact: true }).fill("Test item");
    await editor
      .getByLabel("Unit amount in NEAR 1", { exact: true })
      .fill("0.05");
    await editor
      .getByRole("button", { name: "Save local draft", exact: true })
      .click();
    await expect(editor.getByRole("status")).toContainText("Draft saved");
    await editor.close();
    await p
      .getByRole("button", { name: "Refresh saved drafts", exact: true })
      .click();
    await p
      .getByLabel("Saved invoice", { exact: true })
      .selectOption({ label: "LIVE-INVOICE" });
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
    await checkpoint(
      "proposal",
      await p.getByLabel("Transfer proposal ID", { exact: true }).inputValue(),
    );
    await p
      .getByRole("button", {
        name: "Open host session — 0.1 testnet NEAR",
        exact: true,
      })
      .click();
    await success(p);
    await checkpoint("session opened");
    await q.getByLabel("Treasury account", { exact: true }).fill(dao);
    await q.getByRole("button", { name: "Load treasury", exact: true }).click();
    await expect(q.getByRole("status")).toContainText("loaded", {
      timeout: 30000,
    });
    await q.getByLabel("Transfer proposal ID", { exact: true }).fill("0");
    await q
      .getByRole("button", {
        name: "Refresh payment and ceremony",
        exact: true,
      })
      .click();
    await expect(q.getByRole("status")).toContainText("loaded", {
      timeout: 30000,
    });
    await q
      .getByRole("button", { name: "Listen to host sound", exact: true })
      .click();
    await expect(q.getByRole("status")).toContainText(
      /Listening|microphone|Waiting/,
      { timeout: 30000 },
    );
    await p
      .getByRole("button", { name: "Play host sound", exact: true })
      .click();
    await expect(p.getByRole("status")).toContainText("Sound exchange ready", {
      timeout: 30000,
    });
    await expect(q.getByRole("status")).toContainText("Sound exchange ready", {
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
    await expect(p.getByRole("status")).toContainText("loaded", {
      timeout: 30000,
    });
    await checkpoint("two attestations");
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
    await q
      .getByRole("button", { name: "Load chain receipts", exact: true })
      .click();
    await expect(q.getByText(/#0 · settled/)).toBeVisible({ timeout: 60000 });
    await checkpoint("settled receipt verified");
    if (process.env.ACCORYN_LIVE_GOVERNANCE === "1") {
      const carol = `ac-${stamp}-c`;
      await q.getByLabel("New username", { exact: true }).fill(carol);
      await q
        .getByRole("button", { name: "Create testnet account", exact: true })
        .click();
      await success(q);
      await q
        .getByLabel("Local account", { exact: true })
        .selectOption(`${bob}.testnet`);
      await q
        .getByRole("button", { name: "Use local account", exact: true })
        .click();
      await expect(q.getByRole("status")).toContainText("Local key confirmed", {
        timeout: 30000,
      });
      await p
        .getByRole("button", {
          name: "Refresh payment and ceremony",
          exact: true,
        })
        .click();
      await expect(p.getByRole("status")).toContainText("loaded", {
        timeout: 30000,
      });
      async function approveGovernance() {
        await p
          .getByRole("button", {
            name: "Approve displayed governance proposal",
            exact: true,
          })
          .click();
        await success(p);
        const id = await p
          .getByLabel("Governance proposal ID", { exact: true })
          .inputValue();
        await q.getByLabel("Governance proposal ID", { exact: true }).fill(id);
        await q
          .getByRole("button", {
            name: "Load governance proposal",
            exact: true,
          })
          .click();
        await expect(q.getByRole("status")).toContainText(
          "complete governance proposal",
          { timeout: 30000 },
        );
        await q
          .getByRole("button", {
            name: "Approve displayed governance proposal",
            exact: true,
          })
          .click();
        await success(q);
      }
      await p
        .getByRole("button", {
          name: "Propose disabling factory automatic upgrades",
          exact: true,
        })
        .click();
      await success(p);
      await approveGovernance();
      await expect(
        q.getByText(/Factory configuration:.*"auto_update":false/),
      ).toBeVisible();
      await checkpoint("factory auto-update disabled");
      await p
        .getByLabel("Complete next member list", { exact: true })
        .fill(`${alice}.testnet\n${carol}.testnet`);
      await p
        .getByRole("button", {
          name: "Propose complete member update",
          exact: true,
        })
        .click();
      await success(p);
      await approveGovernance();
      await expect(
        q.getByText(`${carol}.testnet`, { exact: true }),
      ).toBeVisible();
      await checkpoint("atomic member replacement", `${carol}.testnet`);
    }
  } finally {
    await a.close();
    await b.close();
  }
});
