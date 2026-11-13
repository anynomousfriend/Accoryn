import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Real filesystem contract: emitted deep links must use the real build entry.
test("built routes contain the same entry document", async () => {
  const { writeRoutePages } = await import("../scripts/create-route-pages.mjs");
  const directory = await mkdtemp(join(tmpdir(), "treasury-routes-"));
  try {
    const html =
      '<!doctype html><script type="module" src="/assets/app.js"></script>';
    await writeFile(join(directory, "index.html"), html);
    await writeRoutePages(directory);
    for (const path of ["device-check/index.html", "design/index.html", "landing/index.html", "object-registration/index.html", "workspace/index.html"]) {
      assert.equal(await readFile(join(directory, path), "utf8"), html);
    }
    // A second build safely replaces entries instead of retaining stale code.
    await writeFile(
      join(directory, "index.html"),
      html + "<title>New build</title>",
    );
    await writeRoutePages(directory);
    assert.equal(
      await readFile(join(directory, "design/index.html"), "utf8"),
      html + "<title>New build</title>",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("route generation rejects a missing build entry", async () => {
  const { writeRoutePages } = await import("../scripts/create-route-pages.mjs");
  const directory = await mkdtemp(join(tmpdir(), "treasury-routes-"));
  try {
    await assert.rejects(writeRoutePages(directory), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
