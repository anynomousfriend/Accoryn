// Creates a real Sputnik DAO on testnet whose transfers can only be approved by
// the ceremony gate, then verifies the stored policy with the app's own
// conformance check. Uses near-cli legacy keychain keys (~/.near-credentials),
// never keys from the repository. Costs ~6 testnet NEAR (held by the new DAO).
//
// Usage (from web/):
//   ACCORYN_CREATOR=you.testnet ACCORYN_MEMBERS=you.testnet,friend.testnet,third.testnet \
//   ACCORYN_DAO_NAME=my-team node scripts/create-gated-dao-testnet.ts
// Optional: ACCORYN_GATE (default ceremony-gate-v1.accoryn.testnet), ACCORYN_FUND_NEAR (extra NEAR
// sent from the creator to the new DAO for payouts, default 1).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, actions } from "near-api-js";
import { buildCreateDaoArgs, SPUTNIK_FACTORY_ID } from "../src/engines/near/sputnik.ts";
import { checkPolicyConformance } from "../src/engines/near/policy.ts";

const RPC = process.env.NEAR_TESTNET_RPC ?? "https://rpc.testnet.fastnear.com";
const GATE = process.env.ACCORYN_GATE ?? "ceremony-gate-v1.accoryn.testnet";
const CREATOR = process.env.ACCORYN_CREATOR;
const MEMBERS = (process.env.ACCORYN_MEMBERS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
const NAME = process.env.ACCORYN_DAO_NAME;
const FUND_NEAR = BigInt(process.env.ACCORYN_FUND_NEAR ?? "1");
const NEAR = 10n ** 24n;
const TGAS = 1_000_000_000_000n;

function fail(message: string): never {
  console.error("✗ " + message);
  process.exit(1);
}

async function view(contract: string, method: string, input: unknown): Promise<any> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "dao",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contract,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(input)).toString("base64"),
      },
    }),
  });
  const body = await response.json();
  if (body.error || body.result?.error) return null;
  return JSON.parse(Buffer.from(body.result.result).toString());
}

async function main() {
  if (!CREATOR || !NAME || MEMBERS.length < 2) fail("Set ACCORYN_CREATOR, ACCORYN_DAO_NAME and at least two ACCORYN_MEMBERS.");
  if (!MEMBERS.includes(CREATOR)) fail("The creator must be one of the members.");
  const daoId = `${NAME}.${SPUTNIK_FACTORY_ID}`;
  if ((await view(daoId, "get_policy", {})) !== null) fail(`${daoId} already exists. Choose another ACCORYN_DAO_NAME.`);

  const file = join(homedir(), ".near-credentials", "testnet", `${CREATOR}.json`);
  const { private_key: secret } = JSON.parse(readFileSync(file, "utf8")) as { private_key: `ed25519:${string}` };
  const creator = new Account(CREATOR, RPC, secret);

  const { name, args } = buildCreateDaoArgs({
    name: NAME,
    purpose: "Accoryn team treasury (ceremony-gated transfers)",
    members: MEMBERS,
    gateId: GATE,
  });
  const created = await creator.callFunctionRaw({
    contractId: SPUTNIK_FACTORY_ID,
    methodName: "create",
    args: { name, args },
    deposit: 6n * NEAR,
    gas: 150n * TGAS,
    waitUntil: "FINAL",
  });
  console.log(`✓ create sent — https://testnet.nearblocks.io/txns/${created.transaction.hash}`);

  // The factory returns no value on testnet; confirm the DAO exists instead.
  const policy = await view(daoId, "get_policy", {});
  if (policy === null) fail(`${daoId} was not created (the factory refunds the deposit on failure).`);
  const conformance = checkPolicyConformance(policy, { gateId: GATE });
  if (!conformance.ok) fail(`stored policy is not gated: ${conformance.reasons.join(", ")}`);
  console.log(`✓ ${daoId} created; policy gated (members ${conformance.members.join(", ")}, governance ${conformance.governanceApprovals} of ${MEMBERS.length})`);

  if (FUND_NEAR > 0n) {
    const funded = await creator.signAndSendTransaction({
      receiverId: daoId,
      actions: [actions.transfer(FUND_NEAR * NEAR)],
      waitUntil: "FINAL",
    });
    console.log(`✓ funded with ${FUND_NEAR} NEAR — https://testnet.nearblocks.io/txns/${funded.transaction.hash}`);
  }
  const available = await view(daoId, "get_available_amount", {});
  console.log(`✓ spendable treasury balance: ${(Number(BigInt(available)) / 1e24).toFixed(4)} NEAR`);
  console.log(`\nNext: ACCORYN_DAO=${daoId} node scripts/smoke-ceremony-testnet.ts (set ACCORYN_HOST/ATTENDEES/EXECUTOR to your members)`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
