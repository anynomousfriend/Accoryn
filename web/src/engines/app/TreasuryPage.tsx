import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, ActionLink, SiteHeader } from "../../design/primitives.tsx";
import { Keystore } from "../near/keystore.ts";
import { TxJournal } from "../near/txjournal.ts";
import { NearRpcClient } from "../near/rpc.ts";
import { validateNewAccountId } from "../near/account.ts";
import {
  Operations,
  indexedOperationStore,
  type Operation,
} from "./operations.ts";
import {
  TreasuryFlow,
  planTreasury,
  planPayment,
  planHardening,
  type BusinessResult,
} from "./writes.ts";
import { GATE, NEAR, type TreasuryView, type PaymentView } from "./engine.ts";
import {
  RESEARCH_HANDOFF,
  validateResearchGrant,
  type ResearchGrant,
} from "./research-session.ts";
import { TemplateStore } from "../../object-registration/template-store.ts";
import {
  readPendingAction,
  beginAction,
  finishAction,
  type PendingAction,
} from "../../workspace/action-journal.ts";
import { DraftEditor } from "../../workspace/DraftEditor.tsx";
import {
  readDrafts,
  saveDraft,
  draftRevision,
  readProposalRefs,
  rememberProposalReference,
  type ProposalRef,
} from "../../workspace/storage.ts";
import {
  formatNearAmount,
  parseNearAmount,
  type PaymentDraft,
} from "../../workspace/drafts.ts";
import {
  receiptToCsv,
  type ReceiptExportRow,
} from "../../payments/receipt-csv.ts";
import { membershipPolicy } from "./protocol.ts";
import {
  encodeDescription,
  parseDescription,
  parseProposal,
} from "../near/sputnik.ts";
const blankInvoice = (treasuryId = ""): PaymentDraft => ({
  id: crypto.randomUUID(),
  reference: "",
  treasuryId,
  recipient: "",
  purpose: "",
  dueDate: new Date().toISOString().slice(0, 10),
  lines: [{ description: "", quantity: 1, unitAmount: "" }],
  updatedAt: new Date().toISOString(),
});
const field =
  "mt-1 min-h-12 w-full rounded-lg border border-line bg-white p-3 text-base";
const writesEnabled =
  (import.meta as ImportMeta & { env: { VITE_ENABLE_TESTNET_WRITES?: string } })
    .env.VITE_ENABLE_TESTNET_WRITES === "1";
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="my-5 rounded-xl border border-line bg-white p-5">
      <h2 className="mb-4 font-serif text-2xl">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
export default function TreasuryPage() {
  const grant = useRef<ResearchGrant | null>(null),
    store = useRef<TemplateStore | null>(null);
  const [engine] = useState(
    () =>
      new TreasuryFlow({
        keys: new Keystore(),
        journal: new TxJournal(),
        operations: new Operations(indexedOperationStore()),
        rpc: new NearRpcClient(),
        authorize: async () => {
          store.current ??= new TemplateStore();
          const template = await store.current.read();
          return (
            !!template && validateResearchGrant(grant.current, template.id)
          );
        },
      }),
  );
  const [unlocked, setUnlocked] = useState(false),
    [message, setMessage] = useState(
      "Read-only lookup is available. No transaction has been signed.",
    ),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null),
    [damaged, setDamaged] = useState(false);
  const [account, setAccount] = useState(""),
    [name, setName] = useState(""),
    [localAccounts, setLocalAccounts] = useState<string[]>([]),
    [selected, setSelected] = useState("");
  const [dao, setDao] = useState(
      () => new URLSearchParams(location.search).get("dao") ?? "",
    ),
    [treasury, setTreasury] = useState<TreasuryView | null>(null),
    [team, setTeam] = useState(""),
    [members, setMembers] = useState("");
  const [invoice, setInvoice] = useState<PaymentDraft | null>(null),
    [invoiceBase, setInvoiceBase] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<ProposalRef[]>([]);
  const [drafts, setDrafts] = useState<PaymentDraft[]>([]),
    [draftId, setDraftId] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const [proposalId, setProposalId] = useState(
      () => new URLSearchParams(location.search).get("proposal") ?? "",
    ),
    [payment, setPayment] = useState<PaymentView | null>(null),
    [heard, setHeard] = useState(false),
    [consent, setConsent] = useState(false),
    [now, setNow] = useState(Date.now());
  const [receipts, setReceipts] = useState<ReceiptExportRow[]>([]),
    [fundAmount, setFundAmount] = useState("1"),
    [governanceId, setGovernanceId] = useState(""),
    [governance, setGovernance] = useState<Record<string, unknown> | null>(
      null,
    ),
    [newMembers, setNewMembers] = useState("");
  const [lastTx, setLastTx] = useState("");
  const current = useRef<{ id: number; controller: AbortController } | null>(
      null,
    ),
    sequence = useRef(0),
    busyRef = useRef(false);
  function stop() {
    sequence.current++;
    current.current?.controller.abort();
    current.current = null;
    engine.releaseResources();
    busyRef.current = false;
    setBusy(false);
    setHeard(false);
    setConsent(false);
  }
  function lock() {
    stop();
    grant.current = null;
    engine.accountId = null;
    setUnlocked(false);
    setAccount("");
  }
  const guards = () => {
    try {
      setPending(readPendingAction());
      setSubmitted(readProposalRefs());
      setDamaged(false);
    } catch {
      setDamaged(true);
    }
  };
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESEARCH_HANDOFF);
      sessionStorage.removeItem(RESEARCH_HANDOFF);
      if (raw) {
        grant.current = JSON.parse(raw);
        store.current ??= new TemplateStore();
        void store.current
          .read()
          .then((template) => {
            if (template && validateResearchGrant(grant.current, template.id))
              setUnlocked(true);
            else {
              grant.current = null;
              setUnlocked(false);
            }
          })
          .catch(() => {
            grant.current = null;
            setUnlocked(false);
          });
      }
    } catch {
      grant.current = null;
    }
    guards();
    void engine.deps.keys
      .list()
      .then((entries) =>
        setLocalAccounts(
          entries
            .filter((e) => e.usable)
            .map((e) => (e.usable ? e.account.accountId : "")),
        ),
      )
      .catch(() => setMessage("Local key storage could not be read."));
    try {
      setDrafts(readDrafts());
    } catch {
      setMessage(
        "Draft storage is unavailable; repair it in the draft workspace.",
      );
    }
    const changed = () => guards();
    const hidden = () => {
      if (document.hidden) {
        stop();
      }
    };
    const tick = setInterval(() => {
      setNow(Date.now());
      if (grant.current && grant.current.expiresAt <= Date.now()) lock();
    }, 1000);
    window.addEventListener("storage", changed);
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(tick);
      window.removeEventListener("storage", changed);
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", hidden);
      current.current?.controller.abort();
      engine.releaseResources();
      store.current?.close();
    };
  }, [engine]);
  async function run(job: (signal: AbortSignal, id: number) => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    setMessage("Working… waiting for a confirmed outcome.");
    const id = ++sequence.current,
      controller = new AbortController();
    current.current = { id, controller };
    try {
      await job(controller.signal, id);
    } catch (e) {
      if (sequence.current === id) {
        setFailed(true);
        setMessage(
          (e instanceof Error ? e.message : "Operation failed.") +
            " Any pending request is retained for reconciliation.",
        );
      }
    } finally {
      if (sequence.current === id) {
        busyRef.current = false;
        setBusy(false);
        current.current = null;
        guards();
      }
    }
  }
  async function apply(
    result: BusinessResult,
    id: number,
    signal: AbortSignal,
  ) {
    if (sequence.current !== id) return;
    if (result.txHash) setLastTx(result.txHash);
    setMessage(
      "Action outcome: " + result.status + ". " + (result.message ?? ""),
    );
    if (result.treasuryId) {
      setDao(result.treasuryId);
      try {
        const t = await engine.treasury(result.treasuryId, signal);
        if (sequence.current === id) setTreasury(t);
      } catch {
        signal.throwIfAborted();
      }
    }
    if (result.governanceId !== undefined && result.treasuryId) {
      const raw = await engine.deps.rpc.viewFunction<Record<string, unknown>>(
        result.treasuryId,
        "get_proposal",
        { id: Number(result.governanceId) },
        { signal },
      );
      if (sequence.current === id) {
        setGovernanceId(result.governanceId);
        setGovernance(raw);
      }
    }
    if (result.proposalId !== undefined && result.treasuryId) {
      setProposalId(result.proposalId);
      try {
        const p = await engine.payment(
          result.treasuryId,
          result.proposalId,
          signal,
        );
        if (sequence.current === id) setPayment(p);
      } catch {
        signal.throwIfAborted();
      }
    }
  }
  async function rememberSubmission(
    op: Operation,
    result: BusinessResult,
    signal: AbortSignal,
  ) {
    if (
      op.kind !== "propose" ||
      result.status !== "confirmed" ||
      !result.treasuryId ||
      result.proposalId === undefined
    )
      return;
    const input = op.args.input as { proposal: { description: string } };
    const draftId = parseDescription(input.proposal.description).tag?.draft;
    if (!draftId) throw new Error("Submitted draft reference is missing.");
    const payment = await engine.payment(
      result.treasuryId,
      result.proposalId,
      signal,
    );
    const next = await rememberProposalReference({
      draftId,
      treasuryId: result.treasuryId,
      proposalId: result.proposalId,
      contentHash: payment.proposal.contentHash,
    });
    setSubmitted(next);
  }
  async function transact(op: Operation, signal: AbortSignal, id: number) {
    if (!writesEnabled)
      throw new Error("Testnet writes are disabled in this build.");
    await engine.authorize(signal);
    if (op.kind === "propose") {
      const input = op.args.input as { proposal: { description: string } };
      const draftId = parseDescription(input.proposal.description).tag?.draft;
      if (readProposalRefs().some((r) => r.draftId === draftId))
        throw new Error("This draft already has a submitted proposal.");
    }
    if (op.kind === "account")
      op = await engine.prepareAccountOperation(op.actor, op.requestId, signal);
    await engine.deps.operations.begin(op);
    await beginAction(
      {
        requestId: op.requestId,
        kind: op.kind,
        treasuryId: op.receiver,
        draftId:
          op.kind === "propose"
            ? (parseDescription(
                (op.args.input as { proposal: { description: string } })
                  .proposal.description,
              ).tag?.draft ?? null)
            : null,
        proposalId: null,
        startedAt: new Date().toISOString(),
      },
      signal,
    );
    guards();
    const result =
      op.kind === "account"
        ? {
            status: "confirmed" as const,
            message: await engine.createAccount(op.actor, op.requestId, signal),
          }
        : await engine.perform(op, signal);
    // Clear only a definitive business result, never a timeout or a void callback.
    await rememberSubmission(op, result, signal);
    if (result.status === "confirmed" || result.status === "rejected")
      await finishAction(op.requestId);
    if (sequence.current !== id) return;
    if (op.kind === "account") {
      setAccount(op.actor);
      setLocalAccounts((old) => [...new Set([...old, op.actor])]);
    }
    setHeard(false);
    setConsent(false);
    await apply(result, id, signal);
  }
  const blocked = busy || !!pending || damaged || !writesEnabled || !unlocked;
  const paymentOpen =
    !!payment &&
    payment.proposal.status === "pending" &&
    Date.parse(payment.proposal.expiresAt) > now;
  const sessionOpen =
    paymentOpen &&
    payment?.session?.status === "Open" &&
    Number(BigInt(payment.session.expires_at) / 1_000_000n) > now;
  const draft = drafts.find((d) => d.id === draftId);
  const buttonOp = (make: () => Operation) =>
    void run((s, id) => transact(make(), s, id));
  async function refreshPayment(signal: AbortSignal, id: number) {
    const p = await engine.payment(dao, proposalId, signal);
    if (sequence.current === id) {
      setPayment(p);
      setHeard(false);
      setConsent(false);
      setMessage("Current on-chain payment and ceremony loaded.");
    }
  }
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="page-shell max-w-4xl py-10 [overflow-wrap:anywhere]"
      >
        <h1 className="font-serif text-4xl">Testnet team treasury</h1>
        <p className="my-4 text-sm">
          Experimental testnet only. Object scans are manually confirmed
          research results, not authentication. Signing keys are unencrypted and
          extractable in this browser. A sound exchange can be relayed; it does
          not establish a secure room boundary.
        </p>
        <div className="flex flex-wrap gap-3">
          <ActionLink href="/object-registration/" variant="secondary">
            Register / scan object
          </ActionLink>
          <ActionLink href="#invoice" variant="secondary">
            Prepare invoice
          </ActionLink>
          <Button variant="quiet" onClick={lock}>
            Lock research session
          </Button>
        </div>
        {!writesEnabled && (
          <p className="mt-4">
            Testnet writes disabled in this build. Start the local server with
            VITE_ENABLE_TESTNET_WRITES=1 to enable them.
          </p>
        )}
        <p className="mt-4 font-semibold">
          {unlocked
            ? "Research continuation active (10 minutes)"
            : "Research continuation required"}
        </p>
        <p
          role="status"
          className={
            "my-4 rounded-xl border p-4 " + (failed ? "text-danger" : "")
          }
        >
          {message}
        </p>
        {lastTx && (
          <a
            className="break-all underline"
            target="_blank"
            rel="noreferrer"
            href={`https://testnet.nearblocks.io/txns/${lastTx}`}
          >
            View transaction {lastTx}
          </a>
        )}
        {busy && (
          <Button
            onClick={() => {
              stop();
              setMessage("Stopped locally. Reconcile any submitted request.");
            }}
          >
            Stop current operation
          </Button>
        )}
        {damaged && (
          <p role="alert">
            Protected action storage is damaged. Writes are blocked; the record
            has been preserved.
          </p>
        )}
        {pending && (
          <Section title="Pending request">
            <p className="break-all">
              {pending.kind} · {pending.requestId}
            </p>
            <p>Reloading does not authorize another submission.</p>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async (s, id) => {
                  const result = await engine.reconcile(pending.requestId, s);
                  const op = await engine.deps.operations.get(
                    pending.requestId,
                  );
                  if (op) await rememberSubmission(op, result, s);
                  if (
                    result.status === "confirmed" ||
                    result.status === "rejected"
                  )
                    await finishAction(pending.requestId);
                  await apply(result, id, s);
                })
              }
            >
              Reconcile original request
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !unlocked || !writesEnabled}
              onClick={() =>
                void run(async (s, id) => {
                  const op = await engine.deps.operations.get(
                    pending.requestId,
                  );
                  if (!op) throw new Error("No matching engine intent.");
                  if (op.kind === "account") {
                    await engine.createAccount(op.actor, op.requestId, s);
                    await finishAction(op.requestId);
                    if (sequence.current === id) {
                      setAccount(op.actor);
                      setMessage("Original account creation confirmed.");
                    }
                  } else {
                    const result = await engine.perform(op, s);
                    await rememberSubmission(op, result, s);
                    if (
                      result.status === "confirmed" ||
                      result.status === "rejected"
                    )
                      await finishAction(op.requestId);
                    await apply(result, id, s);
                  }
                })
              }
            >
              Resume original request
            </Button>
          </Section>
        )}
        <Section title="1. Your testnet account">
          <p>
            Username is your NEAR testnet account name. Clearing browser data
            loses this browser’s keys. Existing accounts require their local
            key; this screen cannot recover a lost secret.
          </p>
          <label className="block">
            New username
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoCapitalize="none"
              placeholder="your-name"
            />
          </label>
          <Button
            disabled={blocked || !name}
            onClick={() =>
              buttonOp(() => {
                const parsed = validateNewAccountId(name);
                if (!parsed.ok) throw new Error("Invalid username.");
                return {
                  requestId: crypto.randomUUID(),
                  kind: "account",
                  actor: parsed.accountId,
                  receiver: parsed.accountId,
                  args: { accountId: parsed.accountId },
                  deposit: "0",
                };
              })
            }
          >
            Create testnet account
          </Button>
          <label className="block">
            Local account
            <select
              aria-label="Local account"
              className={field}
              value={selected}
              onChange={(e) => {
                stop();
                engine.accountId = null;
                setAccount("");
                setSelected(e.target.value);
              }}
            >
              <option value="">Choose an account</option>
              {localAccounts.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy || damaged || !unlocked || !selected}
            onClick={() =>
              void run(async (s, id) => {
                const a = await engine.selectAccount(selected, s);
                if (sequence.current === id) {
                  setAccount(a);
                  setMessage("Local key confirmed as FullAccess on testnet.");
                }
              })
            }
          >
            Use local account
          </Button>
          <p className="break-all">Current signer: {account || "none"}</p>
        </Section>
        <Section title="2. Shared vault">
          <label className="block">
            Treasury account
            <input
              className={field}
              value={dao}
              onChange={(e) => {
                stop();
                setDao(e.target.value);
                setTreasury(null);
                setPayment(null);
                setReceipts([]);
                setGovernance(null);
              }}
              autoCapitalize="none"
              placeholder="team.sputnikv2.testnet"
            />
          </label>
          <Button
            disabled={busy || !dao}
            onClick={() =>
              void run(async (s, id) => {
                const t = await engine.treasury(dao, s);
                if (sequence.current === id) {
                  setTreasury(t);
                  setMessage("Authoritative treasury policy loaded.");
                }
              })
            }
          >
            Load treasury
          </Button>
          {treasury && (
            <div className="space-y-2 text-sm">
              <p className="break-all">{treasury.id}</p>
              <p>
                Governance approvals: {treasury.governanceApprovals} of{" "}
                {treasury.members.length}
              </p>
              <p>
                Account balance: {formatNearAmount(treasury.balanceAtomic)} NEAR
              </p>
              <p>
                Spendable: {formatNearAmount(treasury.spendableAtomic)} NEAR
              </p>
              <ul>
                {treasury.members.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p>
                Gate tiers version {treasury.tiers.version}; rolling spend{" "}
                {formatNearAmount(treasury.tiers.window_spent)} NEAR in window{" "}
                {treasury.tiers.window_id}. Attendance is calculated on-chain
                for each payment and cumulative spend.
              </p>
              <ul>
                {treasury.tiers.tiers.map((t, i) => (
                  <li key={i}>
                    Up to {formatNearAmount(t.up_to)} NEAR: {t.required}{" "}
                    attendees (limited by team size).
                  </li>
                ))}
              </ul>
              <p>
                Factory configuration: {JSON.stringify(treasury.factoryInfo)}
              </p>
            </div>
          )}
          <label className="block">
            Team name
            <input
              className={field}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            />
          </label>
          <label className="block">
            Member usernames (full testnet account IDs, one per line)
            <textarea
              className={field}
              rows={3}
              value={members}
              onChange={(e) => setMembers(e.target.value)}
              placeholder={"alice.testnet\nbob.testnet"}
            />
          </label>
          <p>
            Creation attaches 6 testnet NEAR to the Sputnik factory. Include
            yourself and at least one other member. Humans govern; only the gate
            approves native Transfer proposals. Governance can change policy and
            is an explicit escape hatch.
          </p>
          <Button
            disabled={blocked || !account || !team}
            onClick={() =>
              buttonOp(() =>
                planTreasury(
                  crypto.randomUUID(),
                  account,
                  team,
                  members.trim().split(/\s+/),
                ),
              )
            }
          >
            Create shared vault — 6 testnet NEAR
          </Button>
          <label className="block">
            Add testnet funds (NEAR)
            <input
              className={field}
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <Button
            disabled={blocked || !account || !treasury}
            onClick={() =>
              buttonOp(() => {
                const amount = parseNearAmount(fundAmount);
                if (BigInt(amount) <= 0n)
                  throw new Error("Enter a positive amount.");
                return {
                  requestId: crypto.randomUUID(),
                  kind: "fund",
                  actor: account,
                  receiver: dao,
                  args: {},
                  deposit: amount,
                };
              })
            }
          >
            Fund loaded vault
          </Button>
        </Section>
        <div id="invoice">
          <Section title="3. Invoice payment">
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => {
                setInvoice(blankInvoice(dao));
                setInvoiceBase(null);
                setDraftId("");
                setReviewed(false);
              }}
            >
              New invoice
            </Button>
            {invoice && (
              <DraftEditor
                draft={invoice}
                disabled={busy}
                readOnly={submitted.some((r) => r.draftId === invoice.id)}
                onChange={(value) => {
                  setInvoice(value);
                  setReviewed(false);
                }}
                onSave={() =>
                  void run(async (_signal, id) => {
                    const next = await saveDraft(invoice, invoiceBase);
                    if (sequence.current !== id) return;
                    setDrafts(next);
                    setDraftId(invoice.id);
                    setInvoiceBase(draftRevision(invoice));
                    setReviewed(false);
                    setMessage(
                      "Draft saved locally. Review it explicitly before submission.",
                    );
                  })
                }
                onReview={() => {
                  const saved = drafts.find((d) => d.id === invoice.id);
                  if (
                    !saved ||
                    draftRevision(saved) !== draftRevision(invoice)
                  ) {
                    setMessage(
                      "Save the latest invoice changes before reviewing.",
                    );
                    return;
                  }
                  setDraftId(saved.id);
                  setReviewed(true);
                  setMessage(
                    "Review the exact saved payment below before submitting.",
                  );
                }}
              />
            )}
            <p>
              Prepare and save an invoice here, or select a previously saved
              local draft. Saved drafts remain local until explicitly submitted.
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                try {
                  setDrafts(readDrafts());
                  setReviewed(false);
                } catch {
                  setMessage("Draft storage could not be read.");
                }
              }}
            >
              Refresh saved drafts
            </Button>
            <label className="block">
              Saved invoice
              <select
                aria-label="Saved invoice"
                className={field}
                value={draftId}
                onChange={(e) => {
                  setDraftId(e.target.value);
                  setReviewed(false);
                  const saved = drafts.find((d) => d.id === e.target.value);
                  setInvoice(saved ? structuredClone(saved) : null);
                  setInvoiceBase(saved ? draftRevision(saved) : null);
                }}
              >
                <option value="">Choose invoice</option>
                {drafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.reference}
                  </option>
                ))}
              </select>
            </label>
            {draft && (
              <>
                {submitted.some((r) => r.draftId === draft.id) && (
                  <p>
                    This draft already has a submitted proposal. Refresh its
                    on-chain outcome.
                  </p>
                )}
                <dl className="break-all text-sm">
                  <dt>Treasury</dt>
                  <dd>{draft.treasuryId}</dd>
                  <dt>Recipient</dt>
                  <dd>{draft.recipient}</dd>
                  <dt>Purpose</dt>
                  <dd>{draft.purpose}</dd>
                  <dt>Line items</dt>
                  <dd>
                    {draft.lines
                      .map(
                        (l) =>
                          `${l.description}: ${l.quantity} × ${l.unitAmount} NEAR`,
                      )
                      .join("; ")}
                  </dd>
                </dl>
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I reviewed the exact native NEAR payment and loaded vault.
                </label>
                <Button
                  disabled={
                    blocked ||
                    !account ||
                    !treasury ||
                    treasury.id !== draft.treasuryId ||
                    !reviewed ||
                    (!!invoice &&
                      invoice.id === draft.id &&
                      draftRevision(invoice) !== draftRevision(draft)) ||
                    submitted.some((r) => r.draftId === draft.id)
                  }
                  onClick={() =>
                    buttonOp(() =>
                      planPayment(crypto.randomUUID(), account, draft),
                    )
                  }
                >
                  Submit reviewed invoice proposal
                </Button>
              </>
            )}
            <label className="block">
              Transfer proposal ID
              <input
                className={field}
                value={proposalId}
                onChange={(e) => {
                  stop();
                  setProposalId(e.target.value);
                  setPayment(null);
                }}
                inputMode="numeric"
              />
            </label>
            <Button
              disabled={busy || !dao || !proposalId}
              onClick={() => void run(refreshPayment)}
            >
              Refresh payment and ceremony
            </Button>
            {payment && (
              <div className="break-all text-sm">
                <p>
                  Proposal {payment.proposal.id}: {payment.proposal.status}
                </p>
                <p>
                  Pay {formatNearAmount(payment.proposal.amountAtomic)} native
                  NEAR ({payment.proposal.amountAtomic} atomic) to{" "}
                  {payment.proposal.recipient}
                </p>
                <p>Purpose: {payment.proposal.purpose}</p>
                <p>Hash: {payment.proposal.contentHash}</p>
                <p>Expires: {payment.proposal.expiresAt}</p>
                <p>
                  Attestations:{" "}
                  {payment.proposal.approvals.join(", ") || "none"}; required:{" "}
                  {payment.proposal.requiredApprovals}
                </p>
                {payment.session && (
                  <p>
                    Session {payment.session.session_id}:{" "}
                    {payment.session.status}; expires{" "}
                    {new Date(
                      Number(BigInt(payment.session.expires_at) / 1_000_000n),
                    ).toISOString()}
                    ; host {payment.session.host}; last error{" "}
                    {payment.session.last_error ?? "none"}
                  </p>
                )}
              </div>
            )}
          </Section>
        </div>
        <Section title="4. Sound, consent, execution">
          <p>
            The host opens a five-minute session (0.1 testnet NEAR deposit).
            Other vault members tap Listen before the host plays. Each
            participant then explicitly approves. Use built-in speakers and
            microphones.
          </p>
          <Button
            disabled={blocked || !account || !paymentOpen || !!sessionOpen}
            onClick={() =>
              buttonOp(() => engine.planOpen(payment!, crypto.randomUUID()))
            }
          >
            Open host session — 0.1 testnet NEAR
          </Button>
          <div className="flex flex-wrap gap-3">
            {(["host", "listener"] as const).map((role) => (
              <Button
                key={role}
                disabled={blocked || !account || !sessionOpen}
                onClick={() =>
                  void run(async (s, id) => {
                    setHeard(false);
                    setConsent(false);
                    await engine.exchange(payment!, role, s, (text) => {
                      if (sequence.current === id) setMessage(text);
                    });
                    if (sequence.current === id) setHeard(true);
                  })
                }
              >
                {role === "host" ? "Play host sound" : "Listen to host sound"}
              </Button>
            ))}
          </div>
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={consent}
              disabled={!heard || !sessionOpen || busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I approve this exact recipient, amount and purpose as a vault
            member.
          </label>
          <Button
            disabled={blocked || !account || !heard || !consent || !sessionOpen}
            onClick={() =>
              void run(async (s, id) => {
                if (!consent) throw new Error("Explicit consent required.");
                const op = await engine.planAttest(
                  payment!,
                  crypto.randomUUID(),
                  s,
                );
                await transact(op, s, id);
              })
            }
          >
            Sign member approval
          </Button>
          <Button
            disabled={
              blocked ||
              !account ||
              !sessionOpen ||
              !payment ||
              payment.proposal.approvals.length <
                payment.proposal.requiredApprovals
            }
            onClick={() =>
              buttonOp(() =>
                engine.planGate("execute", payment!, crypto.randomUUID()),
              )
            }
          >
            Execute approved payment
          </Button>
          <Button
            variant="secondary"
            disabled={
              blocked || !sessionOpen || payment?.session?.host !== account
            }
            onClick={() =>
              buttonOp(() =>
                engine.planGate("cancel", payment!, crypto.randomUUID()),
              )
            }
          >
            Cancel host session
          </Button>
          {payment?.transactionIds[0] && (
            <Button
              disabled={blocked || !account}
              onClick={() =>
                buttonOp(() =>
                  engine.planGate(
                    "evidence",
                    payment,
                    crypto.randomUUID(),
                    payment.transactionIds[0],
                  ),
                )
              }
            >
              Publish verified payout evidence
            </Button>
          )}
          <p>
            Success requires a final, successful transfer receipt for this exact
            DAO, recipient and amount. An approved vote alone is not proof of
            payout. Publish evidence so other devices can independently verify
            it.
          </p>
        </Section>
        <Section title="5. Governance and member recovery">
          <p>
            Factory automatic upgrades remain enabled until governance approves
            and confirms the hardening proposal.
          </p>
          <Button
            disabled={blocked || !account || !treasury}
            onClick={() =>
              buttonOp(() => planHardening(crypto.randomUUID(), account, dao))
            }
          >
            Propose disabling factory automatic upgrades
          </Button>
          <p>
            Adding or replacing members is an on-chain policy proposal requiring{" "}
            {treasury?.governanceApprovals ??
              "the current governance threshold"}{" "}
            member votes. It updates both human roles atomically. It does not
            restore a lost key. Complete or cancel an open sound session before
            changing membership.
          </p>
          <label className="block">
            Complete next member list
            <textarea
              className={field}
              rows={3}
              value={newMembers}
              onChange={(e) => setNewMembers(e.target.value)}
            />
          </label>
          <Button
            disabled={blocked || !account || !treasury || !!sessionOpen}
            onClick={() =>
              buttonOp(() => {
                const policy = membershipPolicy(
                  treasury!.policy,
                  newMembers.trim().split(/\s+/),
                  GATE,
                );
                const requestId = crypto.randomUUID();
                return {
                  requestId,
                  kind: "membership",
                  actor: account,
                  receiver: dao,
                  deposit: "0",
                  args: {
                    method: "add_proposal",
                    input: {
                      proposal: {
                        description: encodeDescription(
                          "Update team membership",
                          { req: requestId },
                        ),
                        kind: { ChangePolicy: { policy } },
                      },
                    },
                  },
                };
              })
            }
          >
            Propose complete member update
          </Button>
          <label className="block">
            Governance proposal ID
            <input
              className={field}
              value={governanceId}
              onChange={(e) => {
                setGovernanceId(e.target.value);
                setGovernance(null);
              }}
              inputMode="numeric"
            />
          </label>
          <Button
            disabled={busy || !dao || !/^\d+$/.test(governanceId)}
            onClick={() =>
              void run(async (s, id) => {
                const raw = await engine.deps.rpc.viewFunction<
                  Record<string, unknown>
                >(
                  dao,
                  "get_proposal",
                  { id: Number(governanceId) },
                  { signal: s },
                );
                if (sequence.current === id) {
                  setGovernance(raw);
                  setMessage(
                    "Review the complete governance proposal before voting.",
                  );
                }
              })
            }
          >
            Load governance proposal
          </Button>
          {governance && (
            <>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(governance, null, 2)}
              </pre>
              <Button
                disabled={
                  blocked ||
                  !account ||
                  parseProposal(governance).status !== "InProgress"
                }
                onClick={() =>
                  buttonOp(() => ({
                    requestId: crypto.randomUUID(),
                    kind: "governanceVote",
                    actor: account,
                    receiver: dao,
                    deposit: "0",
                    args: {
                      method: "act_proposal",
                      input: {
                        id: Number(governanceId),
                        action: "VoteApprove",
                      },
                    },
                    expected: { proposal: governance },
                  }))
                }
              >
                Approve displayed governance proposal
              </Button>
            </>
          )}
        </Section>
        <Section title="6. Receipts and read-only board">
          <ActionLink
            variant="secondary"
            href={"/board/?dao=" + encodeURIComponent(dao)}
          >
            Open shareable read-only board
          </ActionLink>
          <Button
            disabled={busy || !dao}
            onClick={() =>
              void run(async (s, id) => {
                const r = await engine.receipts(dao, s);
                if (sequence.current === id) {
                  setReceipts(r);
                  setMessage(
                    "Latest 50 proposals inspected; every settled row has verified transfer evidence.",
                  );
                }
              })
            }
          >
            Load chain receipts
          </Button>
          {receipts.map((r) => (
            <div className="break-all border-t py-3 text-sm" key={r.proposalId}>
              <p>
                #{r.proposalId} · {r.status} ·{" "}
                {formatNearAmount(r.amountAtomic)} NEAR → {r.recipient}
              </p>
              {r.transactionIds.map((tx) => (
                <a
                  key={tx}
                  className="block underline"
                  href={`https://testnet.nearblocks.io/txns/${tx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Verified payout {tx}
                </a>
              ))}
            </div>
          ))}
          <Button
            variant="secondary"
            disabled={!receipts.length || busy}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([receiptToCsv(receipts)], {
                  type: "text/csv;charset=utf-8",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "testnet-receipts.csv";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download receipt CSV
          </Button>
        </Section>
      </main>
    </>
  );
}
