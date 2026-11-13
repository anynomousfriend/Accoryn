import { actions } from "near-api-js";
import { Keystore } from "../near/keystore.ts";
import { TxJournal } from "../near/txjournal.ts";
import { NearRpcClient } from "../near/rpc.ts";
import {
  createViaTestnetHelper,
  validateNewAccountId,
} from "../near/account.ts";
import {
  Operations,
  indexedOperationStore,
  type Operation,
} from "./operations.ts";
import { checkPolicyConformance } from "../near/policy.ts";
import {
  parseProposal,
  toAppProposal,
  parseDescription,
  type SputnikPolicy,
} from "../near/sputnik.ts";
import { verifyProposalSettlement } from "./settlement-binding.ts";
import { parseSession, type Session } from "./protocol.ts";
import type { Proposal } from "../../integration/services.ts";
import type { ReceiptExportRow } from "../../payments/receipt-csv.ts";
export const GATE = "ceremony-gate-v1.accoryn.testnet";
export const GATE_HASH = "6RyhWz4BnSszxQg88ysQnECuFm2KWUXLUrdqVKtTcfBm";
export const SPUTNIK_HASH = "AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH";
export const NEAR = 10n ** 24n,
  TGAS = 10n ** 12n;
export type Tiers = {
  tiers: { up_to: string; required: number }[];
  window_secs: number;
  version: number;
  custom: boolean;
  window_id: string;
  window_spent: string;
};
export type TreasuryView = {
  id: string;
  members: string[];
  governanceApprovals: number;
  balanceAtomic: string;
  spendableAtomic: string;
  policy: SputnikPolicy;
  tiers: Tiers;
  factoryInfo: unknown;
};
export type PaymentView = {
  currentMembers: string[];
  proposal: Proposal;
  session: Session | null;
  transactionIds: string[];
  createdAt: string;
  invoiceId: string | null;
};
export type EngineDeps = {
  keys: Keystore;
  journal: TxJournal;
  operations: Operations;
  rpc: NearRpcClient;
  authorize: () => Promise<boolean>;
};
/** Testnet-only app adapter. All key custody and signed-byte idempotency live in
 * the existing engines; public operation metadata allows recovery after reload. */
export class TreasuryEngine {
  readonly deps: EngineDeps;
  accountId: string | null = null;
  constructor(deps: EngineDeps) {
    this.deps = deps;
  }
  async authorize(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!(await this.deps.authorize()))
      throw new Error(
        "Complete a fresh scan and acknowledge the research continuation first.",
      );
    signal.throwIfAborted();
  }
  async prepareAccountOperation(
    name: string,
    requestId: string,
    signal: AbortSignal,
  ): Promise<Operation> {
    await this.authorize(signal);
    const parsed = validateNewAccountId(name);
    if (!parsed.ok)
      throw new Error("Use a lowercase testnet username, 2–32 characters.");
    const accountId = parsed.accountId,
      existing = await this.deps.operations.get(requestId);
    if (existing) {
      if (existing.kind !== "account" || existing.actor !== accountId)
        throw new Error("Request ID belongs to a different account intent.");
      const key = await this.deps.keys.get(accountId);
      if (!key || existing.args.publicKey !== key.publicKey)
        throw new Error(
          "The original signing key is unavailable. Account creation cannot be retried with a replacement key.",
        );
      return existing;
    }
    const key = await this.deps.keys.prepare(accountId);
    return {
      requestId,
      kind: "account",
      actor: accountId,
      receiver: accountId,
      args: { accountId, publicKey: key.publicKey },
      deposit: "0",
    };
  }
  async createAccount(
    name: string,
    requestId: string,
    signal: AbortSignal,
  ): Promise<string> {
    const op = await this.prepareAccountOperation(name, requestId, signal);
    await this.deps.operations.begin(op);
    const accountId = op.actor;
    const result = await createViaTestnetHelper({
      accountId,
      publicKey: String(op.args.publicKey),
      rpc: this.deps.rpc,
      signal,
    });
    if (result.status === "rejected")
      throw new Error(
        `Testnet helper refused creation (HTTP ${result.httpStatus}). The name and original key are retained; resume this request later.`,
      );
    if (result.status === "taken")
      throw new Error(
        "That username belongs to a different key. Reconcile the request before choosing another name.",
      );
    if (result.status !== "created")
      throw new Error(
        "Helper outcome is not yet confirmed. Reconcile this request; its original key is retained.",
      );
    await this.deps.keys.markActive(accountId, this.deps.rpc, { signal });
    signal.throwIfAborted();
    this.accountId = accountId;
    return accountId;
  }
  async selectAccount(accountId: string, signal: AbortSignal): Promise<string> {
    await this.authorize(signal);
    if (!(await this.deps.keys.get(accountId)))
      throw new Error(
        "No signing key for this account in this browser. Lost keys require governance recovery.",
      );
    await this.deps.keys.markActive(accountId, this.deps.rpc, { signal });
    signal.throwIfAborted();
    this.accountId = accountId;
    return accountId;
  }
  async pinGate(signal: AbortSignal) {
    const account = await this.deps.rpc.viewAccount(GATE, { signal });
    if (account.codeHash !== GATE_HASH)
      throw new Error(
        "Gate code hash changed. Writes are blocked pending review.",
      );
  }
  async treasury(id: string, signal: AbortSignal): Promise<TreasuryView> {
    if (!/^[a-z0-9_-]+\.sputnikv2\.testnet$/.test(id))
      throw new Error("Enter a Sputnik testnet treasury account.");
    const rpc = this.deps.rpc;
    const [policy, account, available, tiers, factoryInfo] = await Promise.all([
      rpc.viewFunction<SputnikPolicy>(id, "get_policy", {}, { signal }),
      rpc.viewAccount(id, { signal }),
      rpc.viewFunction<string>(id, "get_available_amount", {}, { signal }),
      rpc.viewFunction<Tiers>(GATE, "get_tiers", { dao_id: id }, { signal }),
      rpc.viewFunction(id, "get_factory_info", {}, { signal }),
    ]);
    if (account.codeHash !== SPUTNIK_HASH)
      throw new Error(
        "Treasury code hash changed or is unsupported. Writes require review.",
      );
    const check = checkPolicyConformance(policy, { gateId: GATE });
    if (!check.ok)
      throw new Error(
        "Treasury policy is not ceremony-gated: " + check.reasons.join(", "),
      );
    if (
      typeof available !== "string" ||
      !/^\d+$/.test(available) ||
      !tiers ||
      !Array.isArray(tiers.tiers) ||
      !Number.isInteger(tiers.version) ||
      !/^\d+$/.test(tiers.window_spent) ||
      !Number.isInteger(tiers.window_secs) ||
      tiers.tiers.some(
        (t) =>
          !/^\d+$/.test(t.up_to) ||
          !Number.isInteger(t.required) ||
          t.required < 1,
      )
    )
      throw new Error("Malformed balance or tier policy.");
    return {
      id,
      members: check.members,
      governanceApprovals: check.governanceApprovals,
      balanceAtomic: account.amount,
      spendableAtomic: available,
      policy,
      tiers,
      factoryInfo,
    };
  }
  async session(
    dao: string,
    id: string,
    signal: AbortSignal,
  ): Promise<Session | null> {
    if (!/^(0|[1-9][0-9]*)$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw new Error("Invalid proposal ID.");
    const raw = await this.deps.rpc.viewFunction(
      GATE,
      "get_session",
      { dao_id: dao, proposal_id: Number(id) },
      { signal },
    );
    return raw == null ? null : parseSession(raw);
  }
  async payment(
    dao: string,
    id: string,
    signal: AbortSignal,
  ): Promise<PaymentView> {
    const t = await this.treasury(dao, signal);
    const [raw, session] = await Promise.all([
      this.deps.rpc.viewFunction(
        dao,
        "get_proposal",
        { id: Number(id) },
        { signal },
      ),
      this.session(dao, id, signal),
    ]);
    const parsed = parseProposal(raw);
    if (String(parsed.id) !== id || parsed.kind.kind !== "transfer")
      throw new Error("This is not the requested transfer proposal.");
    const required = await this.deps.rpc.viewFunction<number>(
      GATE,
      "required_attendees",
      {
        dao_id: dao,
        amount: parsed.kind.amount,
        eligible_count: t.members.length,
      },
      { signal },
    );
    if (
      !Number.isInteger(required) ||
      required < 1 ||
      required > t.members.length
    )
      throw new Error("Invalid attendance requirement.");
    const candidates = new Set(session?.evidence_txs ?? []);
    for (const e of await this.deps.journal.list())
      if (e.usable && e.record.kind === `execute:${dao}:${id}`)
        candidates.add(e.record.txHash);
    const verified: string[] = [];
    for (const hash of candidates) {
      // Evidence pointers are untrusted. Independently retrieve and check the exact
      // DAO -> recipient transfer, including finality and receipt execution.
      try {
        const tx = await this.deps.rpc.txStatus(
          hash,
          session?.host ?? dao,
          "FINAL",
          { signal, receipts: true },
        );
        if (
          verifyProposalSettlement(tx, {
            gateId: GATE,
            proposalId: id,
            sessionId: session?.session_id ?? "",
            daoId: dao,
            receiverId: parsed.kind.receiverId,
            amountAtomic: parsed.kind.amount,
            proposalStatus: parsed.status,
          }).ok
        )
          verified.push(hash);
      } catch {
        signal.throwIfAborted();
      }
    }
    const proposal = toAppProposal({
      daoId: dao,
      raw,
      policy: t.policy,
      nowMs: Date.now(),
      attestations: session?.attestations.map((a) => a.account_id) ?? [],
      requiredAttendees: session?.required ?? required,
      settlementVerified: verified.length > 0,
    });
    return {
      currentMembers: t.members,
      proposal,
      session,
      transactionIds: verified,
      createdAt: new Date(
        Number(BigInt(parsed.submissionTimeNs) / 1_000_000n),
      ).toISOString(),
      invoiceId: parseDescription(parsed.description).tag?.inv ?? null,
    };
  }
  async receipts(
    dao: string,
    signal: AbortSignal,
  ): Promise<ReceiptExportRow[]> {
    const count = await this.deps.rpc.viewFunction<number>(
      dao,
      "get_last_proposal_id",
      {},
      { signal },
    );
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error("Invalid proposal count.");
    const result: ReceiptExportRow[] = [];
    for (let id = Math.max(0, count - 50); id < count; id++) {
      const raw = await this.deps.rpc.viewFunction(
        dao,
        "get_proposal",
        { id },
        { signal },
      );
      if (parseProposal(raw).kind.kind !== "transfer") continue;
      const p = await this.payment(dao, String(id), signal);
      result.push({
        network: "testnet",
        treasuryId: dao,
        proposalId: String(id),
        invoiceId: p.invoiceId,
        recipient: p.proposal.recipient,
        asset: "native",
        amountAtomic: p.proposal.amountAtomic,
        decimals: 24,
        status: p.proposal.status === "rejected" ? "failed" : p.proposal.status,
        createdAt: p.createdAt,
        updatedAt: new Date().toISOString(),
        transactionIds: p.transactionIds,
      });
    }
    return result;
  }
  async signer(signal: AbortSignal) {
    await this.authorize(signal);
    if (!this.accountId) throw new Error("Select a local account first.");
    await this.deps.keys.markActive(this.accountId, this.deps.rpc, { signal });
    await this.pinGate(signal);
    return {
      id: this.accountId,
      signer: await this.deps.keys.signerFor(this.accountId),
    };
  }
  async submit(op: Operation, signal: AbortSignal, gas = 50n * TGAS) {
    const actor = await this.signer(signal);
    if (actor.id !== op.actor) throw new Error("Account changed.");
    await this.deps.operations.begin(op);
    await this.authorize(signal);
    signal.throwIfAborted();
    const tx = await this.deps.journal.submit({
      requestId: op.requestId,
      kind: op.kind,
      signerId: actor.id,
      signer: actor.signer,
      receiverId: op.receiver,
      actions: [
        op.kind === "fund"
          ? actions.transfer(BigInt(op.deposit))
          : actions.functionCall(
              String(op.args.method),
              op.args.input as object,
              gas,
              BigInt(op.deposit),
            ),
      ],
      rpc: this.deps.rpc,
      waitUntil: "FINAL",
      signal,
    });
    if (tx.status !== "final")
      throw new Error(
        "Transaction outcome is not final; reconcile this request.",
      );
    return tx;
  }
}
export function createTreasuryEngine(
  authorize: () => Promise<boolean>,
): TreasuryEngine {
  return new TreasuryEngine({
    keys: new Keystore(),
    journal: new TxJournal(),
    operations: new Operations(indexedOperationStore()),
    rpc: new NearRpcClient(),
    authorize,
  });
}
