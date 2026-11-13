import {
  TreasuryEngine,
  GATE,
  NEAR,
  TGAS,
  type PaymentView,
} from "./engine.ts";
import type { Operation } from "./operations.ts";
import {
  buildCreateDaoArgs,
  deriveDaoName,
  SPUTNIK_FACTORY_ID,
  encodeDescription,
  parseDescription,
  parseProposal,
} from "../near/sputnik.ts";
import {
  validateDraft,
  totalAtomic,
  type PaymentDraft,
} from "../../workspace/drafts.ts";
import { assertSessionFor, assertCurrentMembership, type Session } from "./protocol.ts";
import {
  generateChallenge,
  ceremonySeed,
  nearPublicKey,
  sessionPublicKey,
  attestationMessage,
  signAttestation,
  encodeChallenge,
} from "../ceremony/crypto.ts";
import { createAcousticModem, type AcousticModem } from "../acoustic/modem.ts";
import { RpcRequestError } from "../near/rpc.ts";
import { isTestnetAccountId, parseEd25519PublicKey } from "../near/keystore.ts";
import { listenForChallenge } from "../acoustic/session.ts";
export type BusinessResult = {
  status: "confirmed" | "rejected" | "unknown" | "pending";
  treasuryId?: string;
  proposalId?: string;
  governanceId?: string;
  txHash?: string;
  message?: string;
};
export function planTreasury(
  requestId: string,
  actor: string,
  name: string,
  members: string[],
): Operation {
  if (!members.includes(actor)) throw new Error("Creator must be a member.");
  const args = buildCreateDaoArgs({
    name: deriveDaoName(name, requestId),
    purpose: "Team treasury with explicit acoustic member approvals",
    members,
    gateId: GATE,
  });
  return {
    requestId,
    kind: "create",
    actor,
    receiver: SPUTNIK_FACTORY_ID,
    args: { method: "create", input: args },
    deposit: (6n * NEAR).toString(),
    expected: { treasuryId: `${args.name}.${SPUTNIK_FACTORY_ID}`, members },
  };
}
export function planPayment(
  requestId: string,
  actor: string,
  value: PaymentDraft,
): Operation {
  const draft = validateDraft(value);
  return {
    requestId,
    kind: "propose",
    actor,
    receiver: draft.treasuryId,
    deposit: "0",
    args: {
      method: "add_proposal",
      input: {
        proposal: {
          description: encodeDescription(draft.purpose, {
            req: requestId,
            draft: draft.id,
            inv: draft.reference,
          }),
          kind: {
            Transfer: {
              token_id: "",
              receiver_id: draft.recipient,
              amount: totalAtomic(draft),
            },
          },
        },
      },
    },
  };
}
export function confirmBusinessResult(
  op: Operation,
  view: { session?: Session | null; settled?: boolean; proposalId?: string },
): BusinessResult {
  const input = (op.args.input ?? {}) as Record<string, unknown>;
  if (op.kind === "open")
    return {
      status:
        view.session?.session_pk === input.session_pk &&
        view.session?.host === op.actor &&
        view.session?.status === "Open"
          ? "confirmed"
          : "rejected",
    };
  if (op.kind === "attest")
    return {
      status:
        view.session?.session_id === op.expected?.sessionId &&
        view.session?.attestations.some((a) => a.account_id === op.actor)
          ? "confirmed"
          : "rejected",
    };
  if (op.kind === "execute")
    return { status: view.settled ? "confirmed" : "unknown" };
  if (op.kind === "cancel")
    return {
      status:
        view.session?.session_id === op.expected?.sessionId &&
        view.session?.status === "Cancelled"
          ? "confirmed"
          : "rejected",
    };
  return {
    status: view.proposalId !== undefined ? "confirmed" : "unknown",
    proposalId: view.proposalId,
  };
}
/** Adds journaled business actions and ephemeral sound to the read/account adapter.
 * No challenge, frame, seed or key is persisted in operation metadata. */
export class TreasuryFlow extends TreasuryEngine {
  override async createAccount(
    name: string,
    requestId: string,
    signal: AbortSignal,
  ): Promise<string> {
    return operationLock(
      requestId,
      () => super.createAccount(name, requestId, signal),
      signal,
    );
  }
  private secret: {
    seed: Uint8Array;
    frame: string;
    dao: string;
    proposalId: string;
    sessionPk: string;
    sessionId?: string;
    host: boolean;
  } | null = null;
  private modem: AcousticModem | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private expireAt(deadline: number) {
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = setTimeout(
      () => this.releaseResources(),
      Math.max(0, deadline - Date.now()),
    );
  }
  releaseResources() {
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null;
    this.modem?.dispose();
    this.modem = null;
    if (this.secret) this.secret.seed.fill(0);
    this.secret = null;
  }
  planOpen(p: PaymentView, requestId: string): Operation {
    if (!this.accountId) throw new Error("Select an account.");
    this.releaseResources();
    const challenge = generateChallenge();
    const seed = ceremonySeed(
      GATE,
      p.proposal.treasuryId,
      p.proposal.id,
      challenge,
    );
    const pk = nearPublicKey(sessionPublicKey(seed));
    this.secret = {
      seed,
      frame: encodeChallenge(challenge),
      dao: p.proposal.treasuryId,
      proposalId: p.proposal.id,
      sessionPk: pk,
      host: true,
    };
    challenge.fill(0);
    this.expireAt(Date.now() + 300000);
    return {
      requestId,
      kind: "open",
      actor: this.accountId,
      receiver: GATE,
      args: {
        method: "open_session",
        input: {
          dao_id: p.proposal.treasuryId,
          proposal_id: Number(p.proposal.id),
          session_pk: pk,
          ttl_secs: 300,
        },
      },
      deposit: (NEAR / 10n).toString(),
      expected: { contentHash: p.proposal.contentHash },
    };
  }
  planGate(
    kind: "execute" | "cancel" | "evidence",
    p: PaymentView,
    requestId: string,
    txHash?: string,
  ): Operation {
    if (!this.accountId) throw new Error("Select an account.");
    return {
      requestId,
      kind:
        kind === "execute"
          ? `execute:${p.proposal.treasuryId}:${p.proposal.id}`
          : kind,
      actor: this.accountId,
      receiver: GATE,
      args: {
        method:
          kind === "cancel"
            ? "cancel_session"
            : kind === "evidence"
              ? "record_evidence"
              : "execute",
        input: {
          dao_id: p.proposal.treasuryId,
          proposal_id: Number(p.proposal.id),
          ...(kind === "evidence" ? { tx_hash: txHash } : {}),
        },
      },
      deposit: "0",
      expected: {
        contentHash: p.proposal.contentHash,
        sessionId: p.session?.session_id,
      },
    };
  }
  async exchange(
    p: PaymentView,
    role: "host" | "listener",
    signal: AbortSignal,
    onProgress: (s: string) => void,
  ): Promise<void> {
    // init runs synchronously inside the click before the first await/RPC call.
    this.modem ??= createAcousticModem();
    const modem = this.modem;
    const audioReady = modem.init();
    try {
      await audioReady;
      await this.authorize(signal);
      const latest = await this.payment(
        p.proposal.treasuryId,
        p.proposal.id,
        signal,
      );
      if (
        latest.proposal.contentHash !== p.proposal.contentHash ||
        !latest.session ||
        !this.accountId
      )
        throw new Error("Payment changed or session unavailable.");
      const s = latest.session;
      assertSessionFor(s, p.proposal, this.accountId);
      assertCurrentMembership(s,latest.currentMembers);
      if (role === "host") {
        if (
          !this.secret?.host ||
          s.host !== this.accountId ||
          this.secret.sessionPk !== s.session_pk ||
          this.secret.dao !== s.dao_id ||
          this.secret.proposalId !== String(s.proposal_id)
        )
          throw new Error(
            "Host challenge was lost. Cancel the old session and open a new one.",
          );
        this.secret.sessionId = s.session_id;
        this.expireAt(Number(BigInt(s.expires_at) / 1_000_000n));
        onProgress(
          "Playing one audible frame. Ask the other member to listen first.",
        );
        if (
          (await modem.play(this.secret.frame, "audible-fast", 25)) !==
          "completed"
        )
          throw new Error("Playback did not complete.");
      } else {
        if (this.secret) this.secret.seed.fill(0);
        this.secret = null;
        const result = await listenForChallenge({
          modem,
          signal,
          timeoutMs: Math.min(
            45000,
            Number(BigInt(s.expires_at) / 1_000_000n) - Date.now(),
          ),
          onProgress,
          accept: (challenge) =>
            nearPublicKey(
              sessionPublicKey(
                ceremonySeed(GATE, s.dao_id, String(s.proposal_id), challenge),
              ),
            ) === s.session_pk,
        });
        if (result.kind !== "decoded")
          throw new Error(
            "Sound not verified: " + result.kind + ". Try explicitly again.",
          );
        const seed = ceremonySeed(
          GATE,
          s.dao_id,
          String(s.proposal_id),
          result.challenge,
        );
        result.challenge.fill(0);
        signal.throwIfAborted();
        this.secret = {
          seed,
          frame: result.text,
          dao: s.dao_id,
          proposalId: String(s.proposal_id),
          sessionPk: s.session_pk,
          sessionId: s.session_id,
          host: false,
        };
        this.expireAt(Number(BigInt(s.expires_at) / 1_000_000n));
      }
      const current = await this.session(
        s.dao_id,
        String(s.proposal_id),
        signal,
      );
      if (!current || current.session_id !== s.session_id)
        throw new Error("Session changed during sound exchange.");
      assertSessionFor(current, p.proposal, this.accountId);
      onProgress("Sound exchange ready. This has not approved the payment.");
    } catch (e) {
      this.releaseResources();
      throw e;
    }
  }
  async planAttest(
    p: PaymentView,
    requestId: string,
    signal: AbortSignal,
  ): Promise<Operation> {
    const actor = this.accountId,
      s = await this.session(p.proposal.treasuryId, p.proposal.id, signal),
      secret = this.secret;
    if (
      !actor ||
      !s ||
      !secret ||
      secret.sessionId !== s.session_id ||
      secret.sessionPk !== s.session_pk ||
      secret.dao !== s.dao_id ||
      secret.proposalId !== String(s.proposal_id)
    )
      throw new Error(
        "Receive or broadcast this exact session again before consent.",
      );
    assertSessionFor(s, p.proposal, actor);
    const signature = btoa(
      String.fromCharCode(
        ...signAttestation(
          attestationMessage({
            gateId: GATE,
            daoId: s.dao_id,
            proposalId: String(s.proposal_id),
            sessionId: s.session_id,
            receiverId: s.receiver_id,
            amountAtomic: s.amount,
            attendeeId: actor,
          }),
          secret.seed,
        ),
      ),
    );
    return {
      requestId,
      kind: "attest",
      actor,
      receiver: GATE,
      args: {
        method: "attest",
        input: { dao_id: s.dao_id, proposal_id: s.proposal_id, signature },
      },
      deposit: "0",
      expected: {
        contentHash: p.proposal.contentHash,
        sessionId: s.session_id,
      },
    };
  }
  async perform(op: Operation, signal: AbortSignal): Promise<BusinessResult> {
    return operationLock(
      op.requestId,
      () => this.performLocked(op, signal),
      signal,
    );
  }
  private async performLocked(
    op: Operation,
    signal: AbortSignal,
  ): Promise<BusinessResult> {
    if(await this.deps.operations.isCancelled(op.requestId))throw new Error("This intent was cancelled before signing. Review again using a new request.");
    validateWriteIntent(op);
    await this.authorize(signal);
    const method = String(op.args.method),
      input = (op.args.input ?? {}) as Record<string, unknown>;
    const dao =
      typeof input.dao_id === "string"
        ? input.dao_id
        : op.receiver.endsWith(".sputnikv2.testnet")
          ? op.receiver
          : null;
    if (dao && op.kind !== "fund") {
      const t = await this.treasury(dao, signal);
      if (!t.members.includes(op.actor) && op.kind !== "fund")
        throw new Error("Signing account is not a vault member.");
    }
    if (op.expected?.contentHash) {
      const p = await this.payment(
        String(input.dao_id),
        String(input.proposal_id),
        signal,
      );
      if (p.proposal.contentHash !== op.expected.contentHash)
        throw new Error("Payment changed; review again.");
      if (
        ["attest", "open", "execute"].includes(op.kind) ||
        op.kind.startsWith("execute:")
      ) {
        if (
          p.proposal.status !== "pending" ||
          Date.parse(p.proposal.expiresAt) <= Date.now()
        )
          throw new Error("Proposal is no longer pending.");
        if (method !== "open_session") {
          if (!p.session) throw new Error("No session.");
          assertSessionFor(p.session, p.proposal, op.actor);
          assertCurrentMembership(p.session,p.currentMembers);
          if (p.session.session_id !== op.expected.sessionId)
            throw new Error("Session changed.");
        }
      }
    }
    if (op.kind === "governanceVote") {
      const current = await this.deps.rpc.viewFunction(
        op.receiver,
        "get_proposal",
        { id: input.id },
        { signal },
      );
      if (
        JSON.stringify(current) !== JSON.stringify(op.expected?.proposal) ||
        parseProposal(current).status !== "InProgress"
      )
        throw new Error(
          "Governance proposal changed. Load and review it again.",
        );
    }
    const gas =
      method === "execute"
        ? 300n * TGAS
        : method === "create"
          ? 150n * TGAS
          : method === "open_session"
            ? 100n * TGAS
            : 50n * TGAS;
    const tx = await this.submit(op, signal, gas);
    const result = {
      ...(await this.confirm(op, signal, tx.txHash)),
      txHash: tx.txHash,
    };
    if (
      (op.kind.startsWith("execute:") || op.kind === "cancel") &&
      result.status === "confirmed"
    )
      this.releaseResources();
    return result;
  }
  async confirm(
    op: Operation,
    signal: AbortSignal,
    txHash?: string,
  ): Promise<BusinessResult> {
    const input = (op.args.input ?? {}) as Record<string, unknown>;
    if (op.kind === "account") {
      const key = await this.deps.keys.get(op.actor);
      if (!key || key.publicKey !== op.args.publicKey)
        return {
          status: "rejected",
          message: "The original local key is missing; it was not regenerated.",
        };
      try {
        const access = await this.deps.rpc.viewAccessKey(
          op.actor,
          key.publicKey,
          { signal },
        );
        if (!access) {
          await this.deps.rpc.viewAccount(op.actor, { signal });
          return {
            status: "rejected",
            message: "The username exists without the original key.",
          };
        }
        await this.deps.keys.markActive(op.actor, this.deps.rpc, { signal });
        return { status: "confirmed" };
      } catch (e) {
        signal.throwIfAborted();
        if (e instanceof RpcRequestError && e.type === "UNKNOWN_ACCOUNT")
          return { status: "unknown" };
        throw e;
      }
    }
    if (op.kind === "create") {
      const id = String(op.expected?.treasuryId);
      const t = await this.treasury(id, signal);
      return {
        status:
          JSON.stringify([...t.members].sort()) ===
          JSON.stringify([...(op.expected?.members as string[])].sort())
            ? "confirmed"
            : "rejected",
        treasuryId: id,
      };
    }
    if (op.kind === "fund")
      return { status: "confirmed", treasuryId: op.receiver };
    if (["propose", "membership", "hardening"].includes(op.kind)) {
      const count = await this.deps.rpc.viewFunction<number>(
        op.receiver,
        "get_last_proposal_id",
        {},
        { signal },
      );
      if (!Number.isSafeInteger(count) || count < 0 || count > 10000)
        throw new Error("Proposal history requires explicit inspection.");
      const raw: unknown[] = [];
      for (let start = 0; start < count; start += 100) {
        const page = await this.deps.rpc.viewFunction<unknown[]>(
          op.receiver,
          "get_proposals",
          { from_index: start, limit: 100 },
          { signal },
        );
        if (!Array.isArray(page)) throw new Error("Malformed proposal list.");
        raw.push(...page);
      }
      if (!Array.isArray(raw)) throw new Error("Malformed proposal list.");
      const match = raw.filter((r) => {
        const p = parseProposal(r);
        return (
          p.proposer === op.actor &&
          parseDescription(p.description).tag?.req === op.requestId
        );
      });
      if (match.length !== 1) return { status: "rejected" };
      const p = parseProposal(match[0]);
      if (op.kind !== "propose") {
        const expected = input.proposal as {
          description: string;
          kind: unknown;
        };
        const found = match[0] as { description: string; kind: unknown };
        if (
          found.description !== expected.description ||
          canonicalProposalJson(found.kind) !==
            canonicalProposalJson(expected.kind)
        )
          return { status: "rejected" };
      }
      if (op.kind === "propose") {
        const expected = input.proposal as {
          description: string;
          kind: { Transfer: { receiver_id: string; amount: string } };
        };
        if (
          p.description !== expected.description ||
          p.kind.kind !== "transfer" ||
          p.kind.receiverId !== expected.kind.Transfer.receiver_id ||
          p.kind.amount !== expected.kind.Transfer.amount
        )
          return { status: "rejected" };
      }
      return op.kind === "propose"
        ? {
            status: "confirmed",
            treasuryId: op.receiver,
            proposalId: String(p.id),
          }
        : {
            status: "confirmed",
            treasuryId: op.receiver,
            governanceId: String(p.id),
          };
    }
    if (op.kind === "governanceVote") {
      const raw = await this.deps.rpc.viewFunction<Record<string, unknown>>(
        op.receiver,
        "get_proposal",
        { id: input.id },
        { signal },
      );
      const p = parseProposal(raw);
      return {
        status:
          p.votes[op.actor] === "Approve" || p.status === "Approved"
            ? "confirmed"
            : "rejected",
        treasuryId: op.receiver,
        governanceId: String(p.id),
      };
    }
    const dao = String(input.dao_id),
      id = String(input.proposal_id);
    const p = await this.payment(dao, id, signal);
    if (op.kind.startsWith("execute:")) {
      return {
        status:
          p.proposal.status === "settled"
            ? "confirmed"
            : p.session?.status === "Executing"
              ? "pending"
              : p.proposal.status === "pending"
                ? "rejected"
                : "unknown",
        treasuryId: dao,
        proposalId: id,
      };
    }
    if (op.kind === "evidence")
      return {
        status:
          p.session?.evidence_txs.includes(String(input.tx_hash)) &&
          p.transactionIds.includes(String(input.tx_hash))
            ? "confirmed"
            : "rejected",
        treasuryId: dao,
        proposalId: id,
      };
    // An executing transaction is journaled locally before the evidence pointer is
    // recorded, so payment() can verify it even on the first execution return.
    void txHash;
    return {
      ...confirmBusinessResult(op, { session: p.session }),
      treasuryId: dao,
      proposalId: id,
    };
  }
  async reconcile(
    requestId: string,
    signal: AbortSignal,
  ): Promise<BusinessResult> {
    return operationLock(
      requestId,
      () => this.reconcileLocked(requestId, signal),
      signal,
    );
  }
  private async reconcileLocked(
    requestId: string,
    signal: AbortSignal,
  ): Promise<BusinessResult> {
    const op = await this.deps.operations.get(requestId);
    if (!op)
      return {
        status: "unknown",
        message:
          "No engine operation was stored. Preserve the UI intent for inspection.",
      };
    if (op.kind === "account") return this.confirm(op, signal);
    const tx = await this.deps.journal.reconcile(requestId, this.deps.rpc, {
      signal,
    });
    if (tx.status === "not_found") {
      await this.deps.operations.cancelBeforeSigning(requestId);
      return {
        status: "rejected",
        message:
          "No signed transaction was persisted; nothing could have been broadcast.",
      };
    }
    if (tx.status === "failed" || tx.status === "expired")
      return { status: "rejected", txHash: tx.txHash ?? undefined };
    if (tx.status !== "final")
      return {
        status: tx.status === "pending" ? "pending" : "unknown",
        txHash: tx.txHash ?? undefined,
      };
    return {
      ...(await this.confirm(op, signal, tx.txHash ?? undefined)),
      txHash: tx.txHash ?? undefined,
    };
  }
}
export function planHardening(
  requestId: string,
  actor: string,
  dao: string,
): Operation {
  return {
    requestId,
    kind: "hardening",
    actor,
    receiver: dao,
    deposit: "0",
    args: {
      method: "add_proposal",
      input: {
        proposal: {
          description: encodeDescription("Disable factory automatic upgrades", {
            req: requestId,
          }),
          kind: {
            FactoryInfoUpdate: {
              factory_info: {
                factory_id: SPUTNIK_FACTORY_ID,
                auto_update: false,
              },
            },
          },
        },
      },
    },
  };
}
export function validateWriteIntent(op: Operation): void {
  const bad = () => {
    throw new Error("Invalid or unsupported testnet write intent.");
  };
  if (
    !op ||
    !op.requestId ||
    op.requestId.length > 200 ||
    !isTestnetAccountId(op.actor) ||
    !/^(0|[1-9][0-9]{0,38})$/.test(op.deposit)
  )
    bad();
  const input = (op.args.input ?? {}) as Record<string, unknown>,
    method = op.args.method;
  const dao = (id: unknown) =>
    typeof id === "string" && /^[a-z0-9_-]+\.sputnikv2\.testnet$/.test(id);
  const proposalId = (id: unknown) =>
    typeof id === "number" && Number.isSafeInteger(id) && id >= 0;
  if (op.kind === "fund") {
    if (
      !dao(op.receiver) ||
      BigInt(op.deposit) <= 0n ||
      Object.keys(op.args).length !== 0
    )
      bad();
    return;
  }
  if (op.kind === "create") {
    if (
      op.receiver !== SPUTNIK_FACTORY_ID ||
      method !== "create" ||
      op.deposit !== (6n * NEAR).toString() ||
      typeof input.name !== "string" ||
      op.expected?.treasuryId !== `${input.name}.${SPUTNIK_FACTORY_ID}`
    )
      bad();
    return;
  }
  if (["propose", "membership", "hardening"].includes(op.kind)) {
    const p = input.proposal as {
      description: string;
      kind: Record<string, unknown>;
    };
    if (
      !dao(op.receiver) ||
      method !== "add_proposal" ||
      op.deposit !== "0" ||
      !p ||
      parseDescription(p.description).tag?.req !== op.requestId
    )
      bad();
    const variant =
      op.kind === "propose"
        ? "Transfer"
        : op.kind === "membership"
          ? "ChangePolicy"
          : "FactoryInfoUpdate";
    if (Object.keys(p.kind).length !== 1 || !Object.hasOwn(p.kind, variant))
      bad();
    return;
  }
  if (op.kind === "governanceVote") {
    if (
      !dao(op.receiver) ||
      method !== "act_proposal" ||
      op.deposit !== "0" ||
      !proposalId(input.id) ||
      input.action !== "VoteApprove" ||
      !op.expected?.proposal
    )
      bad();
    return;
  }
  const expectedMethod =
    op.kind === "open"
      ? "open_session"
      : op.kind === "attest"
        ? "attest"
        : op.kind === "cancel"
          ? "cancel_session"
          : op.kind === "evidence"
            ? "record_evidence"
            : op.kind === `execute:${input.dao_id}:${input.proposal_id}`
              ? "execute"
              : null;
  if (
    op.receiver !== GATE ||
    !expectedMethod ||
    method !== expectedMethod ||
    !dao(input.dao_id) ||
    !proposalId(input.proposal_id) ||
    op.deposit !== (op.kind === "open" ? (NEAR / 10n).toString() : "0")
  )
    bad();
  if (
    op.kind === "open" &&
    (input.ttl_secs !== 300 || !parseEd25519PublicKey(input.session_pk))
  )
    bad();
  if (
    op.kind === "attest" &&
    (typeof input.signature !== "string" ||
      !/^[A-Za-z0-9+/]{86}==$/.test(input.signature))
  )
    bad();
  if (
    op.kind === "evidence" &&
    (typeof input.tx_hash !== "string" ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.tx_hash))
  )
    bad();
}

async function operationLock<T>(
  id: string,
  job: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  const locks = globalThis.navigator?.locks;
  if (locks)
    return locks.request(
      "accoryn-app-operation:" + id,
      { mode: "exclusive", signal },
      job,
    );
  if (typeof window !== "undefined")
    throw new Error(
      "This browser requires Web Locks for safe operation recovery.",
    );
  return job();
}

/** Policy Group and permissions are sets; object field order is immaterial. */
function canonicalProposalJson(value: unknown, key = ""): string {
  if (Array.isArray(value))
    return JSON.stringify(
      (key === "Group" || key === "permissions"
        ? [...value].sort()
        : value
      ).map((v) => JSON.parse(canonicalProposalJson(v))),
    );
  if (value && typeof value === "object")
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, JSON.parse(canonicalProposalJson(v, k))]),
      ),
    );
  return JSON.stringify(value);
}
