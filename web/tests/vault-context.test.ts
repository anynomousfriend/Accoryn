import { test } from "node:test";
import assert from "node:assert/strict";
import { loadedVaultId } from "../src/engines/app/vault-context.ts";
test("funding cannot target a new vault while the loaded overview still belongs to the previous vault", () => {
  const current = { id: "a.sputnikv2.testnet" };
  assert.equal(loadedVaultId(current, current.id), current.id);
  assert.throws(
    () => loadedVaultId(current, "b.sputnikv2.testnet"),
    /load|vault/i,
  );
  assert.throws(
    () => loadedVaultId(null, "b.sputnikv2.testnet"),
    /load|vault/i,
  );
});
