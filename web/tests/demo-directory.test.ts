import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDemoDirectory,
  sameDemoOrigin,
} from "../server/demo-directory.ts";

test("same-origin admission supports HTTPS HTTP/2 authority as well as HTTP/1 Host", () => {
  assert.equal(
    sameDemoOrigin(
      { origin: "https://localhost:5173", ":authority": "localhost:5173" },
      true,
    ),
    true,
  );
  assert.equal(
    sameDemoOrigin(
      { origin: "http://127.0.0.1:5173", host: "127.0.0.1:5173" },
      false,
    ),
    true,
  );
  assert.equal(
    sameDemoOrigin(
      { origin: "https://other.example", ":authority": "localhost:5173" },
      true,
    ),
    false,
  );
  assert.equal(
    sameDemoOrigin(
      { origin: "http://localhost:5173", ":authority": "localhost:5173" },
      true,
    ),
    false,
  );
  assert.equal(
    sameDemoOrigin({ origin: "null", host: "localhost:5173" }, false),
    false,
  );
});

async function fixture(
  run: (url: string, file: string) => Promise<void>,
  verifyAccount = async (_id: string) => true,
  maxAccounts = 100,
) {
  const dir = await mkdtemp(join(tmpdir(), "demo-users-")),
    file = join(dir, "users.json");
  const handler = createDemoDirectory({ file, verifyAccount, maxAccounts });
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}/api/demo-users`, file);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}
const post = (
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

test("shared HTTP directory persists only deduplicated public IDs across concurrent clients and restart", async () => {
  await fixture(async (url, file) => {
    assert.deepEqual(await (await fetch(url)).json(), {
      version: 1,
      accounts: [],
    });
    const responses = await Promise.all(
      ["bob.testnet", "alice.testnet", "bob.testnet"].map((accountId) =>
        post(url, { accountId }),
      ),
    );
    assert.ok(responses.every((r) => r.ok));
    const expected = { version: 1, accounts: ["alice.testnet", "bob.testnet"] };
    assert.deepEqual(await (await fetch(url)).json(), expected);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), expected);
    const handler = createDemoDirectory({
      file,
      verifyAccount: async () => true,
    });
    const another = createServer((req, res) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve) =>
      another.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = another.address() as { port: number };
      assert.deepEqual(
        await (
          await fetch(`http://127.0.0.1:${address.port}/api/demo-users`)
        ).json(),
        expected,
      );
    } finally {
      another.closeAllConnections();
      await new Promise<void>((resolve) => another.close(() => resolve()));
    }
  });
});
test("malformed, extra private fields, cross-origin and oversized requests cannot enter the directory", async () => {
  await fixture(async (url) => {
    for (const body of [
      { accountId: "alice.near" },
      { accountId: "../alice.testnet" },
      { accountId: "alice.testnet", secretKey: "must-not-be-stored" },
      {},
    ])
      assert.equal((await post(url, body)).status, 400);
    assert.equal(
      (
        await post(
          url,
          { accountId: "alice.testnet" },
          { Origin: "https://unrelated.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await post(url, { accountId: "a".repeat(5000) })).status,
      413,
    );
    assert.deepEqual(await (await fetch(url)).json(), {
      version: 1,
      accounts: [],
    });
  });
});
test("unconfirmed users and RPC outages never become registered entries", async () => {
  await fixture(
    async (url) => {
      assert.equal(
        (await post(url, { accountId: "missing.testnet" })).status,
        404,
      );
      assert.equal(
        (await post(url, { accountId: "outage.testnet" })).status,
        503,
      );
      assert.deepEqual(await (await fetch(url)).json(), {
        version: 1,
        accounts: [],
      });
    },
    async (id) => {
      if (id === "outage.testnet") throw new Error("RPC unavailable");
      return false;
    },
  );
});
test("capacity and corrupt persisted data fail without silently clearing or overwriting the directory", async () => {
  await fixture(
    async (url, file) => {
      assert.equal(
        (await post(url, { accountId: "alice.testnet" })).status,
        200,
      );
      assert.equal(
        (await post(url, { accountId: "alice.testnet" })).status,
        200,
      );
      assert.equal((await post(url, { accountId: "bob.testnet" })).status, 409);
      await writeFile(file, '{"version":99}');
      assert.equal((await fetch(url)).status, 503);
      assert.equal((await post(url, { accountId: "bob.testnet" })).status, 503);
      assert.equal(await readFile(file, "utf8"), '{"version":99}');
    },
    async () => true,
    1,
  );
});
