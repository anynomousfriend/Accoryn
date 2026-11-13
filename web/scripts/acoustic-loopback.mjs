// Same-device physical acoustic loopback through the real /acoustic-check/ UI.
// Opens two visible Chrome windows (listener, broadcaster) and plays real audio
// from this computer's speakers into its own microphone; no fake media devices.
// It is NOT a two-device test: distance, hardware and rooms differ in meetings.
//
// Usage: npm run dev:lan   (in another terminal), then
//        node scripts/acoustic-loopback.mjs [origin]
// Headless Chrome does not use the real speakers/microphone, so the windows
// must stay open and the system output must not be muted.
import { chromium } from "@playwright/test";

const ORIGIN = process.argv[2] ?? "https://localhost:5173";
const MATRIX = [
  ["audible-fast", 25, 6],
  ["audible-fastest", 25, 3],
  ["ultrasound-fast", 50, 3],
];

setTimeout(() => {
  console.error("Stopping after 360 s.");
  process.exit(2);
}, 360_000).unref();

const browser = await chromium.launch({ channel: "chrome", headless: false });
async function open() {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 640, height: 760 } });
  await context.grantPermissions(["microphone"], { origin: ORIGIN });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(ORIGIN + "/acoustic-check/");
  return { page, errors };
}
const listener = await open();
const broadcaster = await open();
const summary = {};
for (const [mode, volume, count] of MATRIX) {
  for (const { page } of [listener, broadcaster]) {
    await page.getByLabel("Sound mode").selectOption(mode);
    await page.getByLabel("Volume").selectOption(String(volume));
  }
  const key = `${mode}@${volume}`;
  summary[key] = { decoded: 0, trials: 0, seconds: [] };
  for (let trial = 1; trial <= count; trial += 1) {
    await listener.page.getByRole("button", { name: "Start listening" }).click();
    await listener.page.getByText("Listening", { exact: true }).waitFor({ timeout: 10_000 });
    await broadcaster.page.getByRole("button", { name: "Start broadcast" }).click();
    const sent = (await broadcaster.page.getByText(/^Check code:/).locator("span").textContent()).trim();
    const started = Date.now();
    let heard = null;
    try {
      const line = listener.page.getByText(/^Heard check code:/);
      await line.waitFor({ timeout: 20_000 });
      heard = (await line.locator("span").textContent()).trim();
    } catch {
      const stop = listener.page.getByRole("button", { name: "Stop" });
      if (await stop.count()) await stop.click();
    }
    await broadcaster.page.getByRole("button", { name: "Stop" }).click().catch(() => {});
    const seconds = heard ? Number(((Date.now() - started) / 1000).toFixed(1)) : null;
    summary[key].trials += 1;
    if (heard === sent) {
      summary[key].decoded += 1;
      summary[key].seconds.push(seconds);
    }
    console.log(JSON.stringify({ mode, volume, trial, sent, heard, match: heard === sent, seconds }));
    await listener.page.waitForTimeout(800);
  }
}
console.log("SUMMARY " + JSON.stringify(summary));
console.log("PAGE ERRORS " + JSON.stringify({ listener: listener.errors, broadcaster: broadcaster.errors }));
await browser.close();
