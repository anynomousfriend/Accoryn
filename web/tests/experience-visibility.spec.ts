import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Browser } from "@playwright/test";

// Playwright normally forces focus/visibility in its own CDP session. A
// native browser attached with noDefaults preserves actual tab transitions.
// This temporary profile belongs only to this test. Linux needs Xvfb.
test("hidden reference cancels illustration playback", async ({ baseURL }) => {
  const directory = await mkdtemp(join(tmpdir(), "treasury-visibility-"));
  const executable =
    process.platform === "darwin" && !process.env.CI
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : chromium.executablePath();
  const child = spawn(
    executable,
    [
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${directory}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let browser: Browser | undefined;
  let startError: Error | undefined;
  child.on("error", (error) => {
    startError = error;
  });
  try {
    let port = "";
    await expect
      .poll(
        async () => {
          if (startError) throw startError;
          try {
            port = (
              await readFile(join(directory, "DevToolsActivePort"), "utf8")
            ).split("\n")[0]!;
            return !!port;
          } catch {
            return false;
          }
        },
        { timeout: 10000, intervals: [100] },
      )
      .toBe(true);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
      noDefaults: true,
    });
    const context = browser.contexts()[0]!;
    const page = context.pages()[0]!;
    await page.goto(`${baseURL}/design/`);
    await page.bringToFront();
    await page.getByRole("button", { name: "Replay illustration" }).click();
    const other = await context.newPage();
    await other.goto("about:blank");
    await other.bringToFront();
    await expect
      .poll(() => page.evaluate(() => document.visibilityState))
      .toBe("hidden");
    expect(
      await page
        .locator("[data-frame-layer]")
        .evaluateAll(
          (elements) =>
            elements
              .flatMap((element) => element.getAnimations())
              .filter((a) => a.playState === "running").length,
        ),
    ).toBe(0);
    await page.bringToFront();
    expect(
      await page
        .locator("[data-frame-layer]")
        .evaluateAll(
          (elements) =>
            elements
              .flatMap((element) => element.getAnimations())
              .filter((a) => a.playState === "running").length,
        ),
    ).toBe(0);
  } finally {
    await browser?.close();
    child.kill();
    if (child.exitCode === null && child.signalCode === null)
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        delay(3000),
      ]);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300,
    });
  }
});
