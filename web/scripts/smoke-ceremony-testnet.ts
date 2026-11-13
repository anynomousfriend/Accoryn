// Live testnet smoke test of one complete ceremony-gated payout.
//
// Uses the real Sputnik DAO and the deployed ceremony gate. Signing keys are read
// from the near-cli legacy keychain (~/.near-credentials/testnet), never from the
// repository. Spends a small amount of testnet NEAR.
//
// Usage: node scripts/smoke-ceremony-testnet.ts [--fund] [--record <dir>]
//   env: ACCORYN_DAO, ACCORYN_GATE, ACCORYN_HOST, ACCORYN_ATTENDEES, ACCORYN_EXECUTOR, ACCORYN_PAYEE
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account } from "near-api-js";
import {
  attestationMessage,
  ceremonySeed,
  generateChallenge,
  nearPublicKey,
  sessionPublicKey,
  signAttestation,
} from "../src/engines/ceremony/crypto.ts";
import { encodeDescription } from "../src/engines/near/sputnik.ts";

const RPC = process.env.NEAR_TESTNET_RPC ?? "https://rpc.testnet.fastnear.com";
const DAO = process.env.ACCORYN_DAO ?? "accoryn-spike.sputnikv2.testnet";
const GATE = process.env.ACCORYN_GATE ?? "ceremony-gate-v1.accoryn.testnet";
const HOST = process.env.ACCORYN_HOST ?? "accoryn-alice.testnet";
const ATTENDEES = (process.env.ACCORYN_ATTENDEES ?? "accoryn-alice.testnet,accoryn-bob.testnet").split(",");
const EXECUTOR = process.env.ACCORYN_EXECUTOR ?? "accoryn-carol.testnet";
const PAYEE = process.env.ACCORYN_PAYEE ?? "accoryn-payee.testnet";
const AMOUNT = 50_000_000_000_000_000_000_000n; // 0.05 NEAR
const TGAS = 1_000_000_000_000n;
const args = process.argv.slice(2);
const recordDir = args.includes("--record") ? args[args.indexOf("--record") + 1] : null;

function account(id: string): Account {
  const file = join(homedir(), ".near-credentials", "testnet", `${id}.json`);
  const { private_key: secret } = JSON.parse(readFileSync(file, "utf8")) as { private_key: `ed25519:${string}` };
  return new Account(id, RPC, secret);
}

async function rpc(method: string, params: unknown): Promise<any> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "smoke", method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function view(contract: string, method: string, input: unknown): Promise<any> {
  const result = await rpc("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(input)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result.result).toString());
}

async function balance(id: string): Promise<bigint> {
  const result = await rpc("query", { request_type: "view_account", finality: "final", account_id: id });
  return BigInt(result.amount);
}

function successValue(tx: any): any {
  const value = tx.status?.SuccessValue;
  if (value === undefined) throw new Error("transaction failed: " + JSON.stringify(tx.status));
  return value === "" ? null : JSON.parse(Buffer.from(value, "base64").toString());
}

const log = (step: string, detail = "") => console.log(`✓ ${step}${detail ? " — " + detail : ""}`);
const explorer = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;

async function main() {
  if (args.includes("--fund")) {
    const tx = await account(EXECUTOR).transfer({ receiverId: DAO, amount: 1_000_000_000_000_000_000_000_000n });
    log("funded treasury with 1 NEAR", explorer(tx.transaction.hash));
  }

  const requestId = crypto.randomUUID();
  const description = encodeDescription("Smoke test: ceremony-gated payout", { req: requestId, inv: "SMOKE-1" });
  const proposed = await account(HOST).callFunctionRaw({
    contractId: DAO,
    methodName: "add_proposal",
    args: { proposal: { description, kind: { Transfer: { token_id: "", receiver_id: PAYEE, amount: AMOUNT.toString() } } } },
    gas: 50n * TGAS,
    waitUntil: "FINAL",
  });
  const proposalId = successValue(proposed) as number;
  log("proposal created", `id ${proposalId}, ${explorer(proposed.transaction.hash)}`);

  const challenge = generateChallenge();
  const seed = ceremonySeed(GATE, DAO, String(proposalId), challenge);
  const opened = await account(HOST).callFunctionRaw({
    contractId: GATE,
    methodName: "open_session",
    args: { dao_id: DAO, proposal_id: proposalId, session_pk: nearPublicKey(sessionPublicKey(seed)), ttl_secs: 300 },
    deposit: 100_000_000_000_000_000_000_000n,
    gas: 100n * TGAS,
    waitUntil: "FINAL",
  });
  const session = await view(GATE, "get_session", { dao_id: DAO, proposal_id: proposalId });
  if (!session || session.status !== "Open") throw new Error("session not open: " + JSON.stringify(successValue(opened)));
  log("session opened", `session ${session.session_id}, requires ${session.required}, ${explorer(opened.transaction.hash)}`);

  for (const attendee of ATTENDEES) {
    const message = attestationMessage({
      gateId: GATE,
      daoId: DAO,
      proposalId: String(proposalId),
      sessionId: session.session_id,
      receiverId: PAYEE,
      amountAtomic: AMOUNT.toString(),
      attendeeId: attendee,
    });
    const signature = Buffer.from(signAttestation(message, seed)).toString("base64");
    const tx = await account(attendee).callFunctionRaw({
      contractId: GATE,
      methodName: "attest",
      args: { dao_id: DAO, proposal_id: proposalId, signature },
      gas: 30n * TGAS,
      waitUntil: "FINAL",
    });
    log(`${attendee} attested`, `count ${successValue(tx)}, ${explorer(tx.transaction.hash)}`);
  }

  const before = await balance(PAYEE);
  const executed = await account(EXECUTOR).callFunctionRaw({
    contractId: GATE,
    methodName: "execute",
    args: { dao_id: DAO, proposal_id: proposalId },
    gas: 300n * TGAS,
    waitUntil: "FINAL",
  });
  const txHash = executed.transaction.hash;
  log("gate executed vote", explorer(txHash));

  const status = await rpc("EXPERIMENTAL_tx_status", { tx_hash: txHash, sender_account_id: EXECUTOR, wait_until: "FINAL" });
  const proposal = await view(DAO, "get_proposal", { id: proposalId });
  const after = await balance(PAYEE);
  const transfers = status.receipts
    .filter((receipt: any) => receipt.predecessor_id === DAO && receipt.receiver_id === PAYEE)
    .flatMap((receipt: any) => receipt.receipt?.Action?.actions ?? [])
    .filter((action: any) => action.Transfer);
  if (proposal.status !== "Approved") throw new Error(`proposal status ${proposal.status}`);
  if (transfers.length !== 1 || BigInt(transfers[0].Transfer.deposit) !== AMOUNT)
    throw new Error("expected exactly one transfer receipt of the proposal amount: " + JSON.stringify(transfers));
  if (after - before !== AMOUNT) throw new Error(`payee balance changed by ${after - before}`);
  log("settlement verified", `proposal Approved, one transfer receipt of ${AMOUNT} yocto, payee +0.05 NEAR`);

  const evidence = await account(HOST).callFunctionRaw({
    contractId: GATE,
    methodName: "record_evidence",
    args: { dao_id: DAO, proposal_id: proposalId, tx_hash: txHash },
    gas: 30n * TGAS,
    waitUntil: "FINAL",
  });
  log("evidence recorded", explorer(evidence.transaction.hash));
  const participation = await view(GATE, "get_participation", { dao_id: DAO, account_id: ATTENDEES[0] });
  log("participation", `${ATTENDEES[0]} has ${participation.ceremonies} ceremonies`);

  if (recordDir) {
    mkdirSync(recordDir, { recursive: true });
    const note = "Real testnet RPC response recorded by scripts/smoke-ceremony-testnet.ts; not a mock.";
    writeFileSync(
      join(recordDir, "tx_status.execute.json"),
      JSON.stringify({ recordedFrom: { network: "testnet", method: "EXPERIMENTAL_tx_status", txHash, senderId: EXECUTOR, note }, result: status }, null, 1) + "\n",
    );
    writeFileSync(
      join(recordDir, "get_proposal.executed.json"),
      JSON.stringify({ recordedFrom: { network: "testnet", accountId: DAO, method: "get_proposal", args: { id: proposalId }, note }, result: proposal }, null, 1) + "\n",
    );
    writeFileSync(
      join(recordDir, "get_session.voted.json"),
      JSON.stringify({ recordedFrom: { network: "testnet", accountId: GATE, method: "get_session", note }, result: await view(GATE, "get_session", { dao_id: DAO, proposal_id: proposalId }) }, null, 1) + "\n",
    );
    log("recorded fixtures", recordDir);
  }
}

main().catch((error) => {
  console.error("✗ smoke test failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
