import {
  validateAccount,
  validateTreasury,
  validateProposal,
  validateEvidence,
} from "../integration/validation.ts";
import { useEffect, useRef, useState } from "react";
import { ActionLink, Button, SiteHeader } from "../design/primitives.tsx";
import { getAppServices } from "../integration/bindings.ts";
import {
  hasService,
  requireService,
  type Account,
  type Treasury,
  type Proposal,
  type AcousticEvidence,
} from "../integration/services.ts";
import { DraftEditor } from "./DraftEditor.tsx";
import {
  isAccountId,
  validateDraft,
  totalAtomic,
  formatNearAmount,
  type PaymentDraft,
} from "./drafts.ts";
import {
  readDrafts,
  writeDrafts,
  clearDrafts,
  readProposalRefs,
  writeProposalRefs,
  type ProposalRef,
  upsertProposalRef,
} from "./storage.ts";
import {
  beginAction,
  readPendingAction,
  finishAction,
  type PendingAction,
  actionConfirmed,
} from "./action-journal.ts";
import {
  receiptToCsv,
  type ReceiptExportRow,
} from "../payments/receipt-csv.ts";
const field =
  "mt-1 min-h-12 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-base";
const blank = (): PaymentDraft => ({
  id: crypto.randomUUID(),
  reference: "",
  treasuryId: "",
  recipient: "",
  purpose: "",
  dueDate: new Date().toISOString().slice(0, 10),
  lines: [{ description: "", quantity: 1, unitAmount: "" }],
  updatedAt: new Date().toISOString(),
});
const card = "rounded-2xl border border-line bg-white p-5 sm:p-7";
export default function WorkspacePage() {
  const [services] = useState(getAppServices);
  const [tab, setTab] = useState("Payment draft");
  const [draft, setDraft] = useState(blank);
  const [drafts, setDrafts] = useState<PaymentDraft[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [message, setMessage] = useState(
    "Local preparation only. No proposal or payment has been submitted.",
  );
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [references, setReferences] = useState<ProposalRef[]>([]);
  const [review, setReview] = useState<PaymentDraft | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [treasury, setTreasury] = useState<Treasury | null>(null);
  const [treasuryId, setTreasuryId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState("");
  const [threshold, setThreshold] = useState(1);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalId, setProposalId] = useState("");
  const [evidence, setEvidence] = useState<AcousticEvidence | null>(null);
  const [consent, setConsent] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptExportRow[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const generation = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const available = (name: Parameters<typeof hasService>[1]) =>
    hasService(services, name);
  const report = (text: string, failed = false) => {
    setMessage(text);
    setError(failed);
  };
  const cancel = () => {
    generation.current++;
    operation.current?.abort();
    operation.current = null;
    services.releaseResources?.();
    setBusy(false);
    setEvidence(null);
    setConsent(false);
  };
  useEffect(() => {
    try {
      setDrafts(readDrafts());
      setPending(readPendingAction());
      setReferences(readProposalRefs());
      setReady(true);
    } catch {
      setStorageError(true);
      report(
        "Local data is incompatible or unavailable. Stored drafts were not overwritten.",
        true,
      );
    }
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        cancel();
        report(
          "Stopped locally. Reconcile any pending action before submitting again.",
        );
      }
    };
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", cancel);
      document.removeEventListener("visibilitychange", hidden);
      generation.current++;
      operation.current?.abort();
      services.releaseResources?.();
    };
  }, [services]);
  const run = async (
    job: (signal: AbortSignal, id: number) => Promise<void>,
  ) => {
    if (busy) return;
    const id = ++generation.current;
    operation.current?.abort();
    operation.current = new AbortController();
    setBusy(true);
    setError(false);
    try {
      await job(operation.current.signal, id);
    } catch (e) {
      if (id === generation.current) {
        report(
          pending || readSafePending()
            ? "Outcome may be unknown. Reconcile the pending action before another submission."
            : "The operation did not complete. Check availability and retry explicitly.",
          true,
        );
      }
    } finally {
      if (id === generation.current) {
        setBusy(false);
        operation.current = null;
      }
    }
  };
  function readSafePending() {
    try {
      return readPendingAction();
    } catch {
      return true;
    }
  }
  const edit = (value: PaymentDraft) => {
    cancel();
    setDraft(value);
    setReview(null);
    setProposal(null);
    setProposalId(
      references.find((r) => r.draftId === value.id)?.proposalId ?? "",
    );
    setEvidence(null);
    setConsent(false);
    setDeleteConfirm(false);
  };
  const save = () => {
    try {
      if (references.some((r) => r.draftId === draft.id))
        throw new Error(
          "This draft already has a proposal reference. Create a new draft for a different payment.",
        );
      const valid = validateDraft({
        ...draft,
        updatedAt: new Date().toISOString(),
      });
      const next = [valid, ...drafts.filter((d) => d.id !== valid.id)];
      writeDrafts(next);
      setDraft(valid);
      setDrafts(next);
      report("Draft saved locally. No payment submitted.");
    } catch (e) {
      report(
        e instanceof Error ? e.message : "Could not save this draft.",
        true,
      );
    }
  };
  const reviewDraft = () => {
    try {
      setReview(validateDraft(draft));
      setConsent(false);
      setEvidence(null);
      report(
        "Review the exact recipient and amount. This is still a local draft.",
      );
    } catch (e) {
      report(e instanceof Error ? e.message : "Check the draft fields.", true);
    }
  };
  const command = async <T,>(
    kind: string,
    id: number,
    job: (requestId: string) => Promise<T>,
    apply: (value: T) => boolean | void,
  ) => {
    const intent: PendingAction = {
      requestId: crypto.randomUUID(),
      kind,
      treasuryId:
        proposal?.treasuryId ||
        review?.treasuryId ||
        treasuryId ||
        "unassigned",
      draftId: review?.id ?? null,
      proposalId: proposal?.id ?? null,
      startedAt: new Date().toISOString(),
    };
    beginAction(intent);
    setPending(intent);
    const result = await job(intent.requestId);
    if (id !== generation.current) return;
    const confirmed = apply(result);
    if (confirmed !== false) {
      finishAction(intent.requestId);
      setPending(null);
    } else
      report(
        "Action outcome is not confirmed. Reconcile before another submission.",
      );
  };
  const write = async (
    kind: string,
    id: number,
    job: (requestId: string) => Promise<Proposal>,
  ) =>
    command(kind, id, job, (result) => {
      result = validateProposal(result);
      if (
        kind === "proposePayment" &&
        review &&
        (result.treasuryId !== review.treasuryId ||
          result.recipient !== review.recipient ||
          result.amountAtomic !== totalAtomic(review) ||
          result.purpose !== review.purpose)
      )
        throw new Error("Proposal does not match the reviewed payment.");
      if (
        kind !== "proposePayment" &&
        proposal &&
        (result.id !== proposal.id ||
          result.contentHash !== proposal.contentHash)
      )
        throw new Error("Proposal changed; review it again.");
      if (review) {
        const next = upsertProposalRef(readProposalRefs(), {
          draftId: review.id,
          treasuryId: result.treasuryId,
          proposalId: result.id,
          contentHash: result.contentHash,
        });
        writeProposalRefs(next);
        setReferences(next);
      }
      setProposal(result);
      setProposalId(result.id);
      setEvidence(null);
      setConsent(false);
      report("Authoritative proposal state: " + result.status + ".");
      return actionConfirmed(kind, result.status);
    });
  const validEvidence =
    !!proposal &&
    !!evidence &&
    evidence.proposalId === proposal.id &&
    evidence.contentHash === proposal.contentHash &&
    Date.parse(evidence.expiresAt) > Date.now();
  const disabled = busy || !ready || storageError;
  return (
    <>
      <SiteHeader />
      <main id="main" className="page-shell max-w-5xl py-8 sm:py-12">
        <p className="eyebrow-label">Testnet · team payments</p>
        <h1 className="mt-3 font-serif text-4xl">Team workspace</h1>
        <p className="mt-4 text-sm leading-6 text-muted">
          Prepare an invoice locally. Account, treasury and payment operations
          become available when their real services are connected.
        </p>
        <nav
          aria-label="Workspace sections"
          className="my-6 flex flex-wrap gap-2"
        >
          {[
            "Payment draft",
            "Account",
            "Team treasury",
            "Approval session",
            "Receipts",
          ].map((name) => (
            <Button
              key={name}
              variant={tab === name ? "primary" : "secondary"}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              {name}
            </Button>
          ))}
        </nav>
        <p
          role={error ? "alert" : "status"}
          className={`mb-5 rounded-xl border border-line bg-white p-4 text-sm leading-6 ${error ? "text-danger" : "text-ink"}`}
        >
          {message}
        </p>
        {busy && (
          <Button
            variant="secondary"
            className="mb-4"
            onClick={() => {
              cancel();
              report(
                "Stopped locally. An action already submitted may still be pending; reconcile before retrying.",
              );
            }}
          >
            Stop current operation
          </Button>
        )}
        {pending && (
          <section className={card + " mb-5"}>
            <h2 className="font-semibold">
              Pending action requires reconciliation
            </h2>
            <p className="mt-2 break-all text-sm">
              {pending.kind} · {pending.requestId}
            </p>
            <p className="mt-2 text-sm text-muted">
              Reloading or timing out does not authorize another payment. This
              record remains until its outcome is confirmed.
            </p>
            <Button
              className="mt-4"
              disabled={busy || !available("reconcileAction")}
              onClick={() =>
                void run(async (signal, id) => {
                  const result = await requireService(
                    services,
                    "reconcileAction",
                  )(pending, signal);
                  if (id !== generation.current) return;
                  if (result.requestId !== pending.requestId)
                    throw new Error("Wrong action response.");
                  if (result.proposal) {
                    const checked = validateProposal(result.proposal);
                    setProposal(checked);
                    setProposalId(checked.id);
                    if (pending.draftId) {
                      const next = upsertProposalRef(readProposalRefs(), {
                        draftId: pending.draftId,
                        treasuryId: checked.treasuryId,
                        proposalId: checked.id,
                        contentHash: checked.contentHash,
                      });
                      writeProposalRefs(next);
                      setReferences(next);
                    }
                  }
                  if (result.account)
                    setAccount(validateAccount(result.account));
                  if (result.treasury) {
                    const checked = validateTreasury(result.treasury);
                    setTreasury(checked);
                    setTreasuryId(checked.id);
                  }
                  if (
                    result.status === "confirmed" ||
                    result.status === "rejected"
                  ) {
                    finishAction(pending.requestId);
                    setPending(null);
                  }
                  report("Action outcome: " + result.status + ".");
                })
              }
            >
              Reconcile pending action
            </Button>
          </section>
        )}
        {tab === "Payment draft" && (
          <div className="space-y-5">
            <section className={card}>
              <h2 className="font-serif text-2xl">Local drafts</h2>
              <p className="mt-2 text-sm text-muted">
                {drafts.length} saved in this browser.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => edit(blank())}
                >
                  New draft
                </Button>
                {drafts.map((d) => (
                  <Button
                    key={d.id}
                    variant="quiet"
                    disabled={busy}
                    onClick={() => edit(structuredClone(d))}
                  >
                    Open {d.reference}
                  </Button>
                ))}
              </div>
            </section>
            <DraftEditor
              draft={draft}
              onChange={edit}
              onSave={save}
              onReview={reviewDraft}
              disabled={disabled}
              readOnly={references.some((r) => r.draftId === draft.id)}
            />
            {review && (
              <section className={card} aria-label="Exact payment review">
                <h2 className="font-serif text-2xl">Review exact payment</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  {[
                    ["Network", "testnet"],
                    ["Treasury", review.treasuryId],
                    ["Recipient", review.recipient],
                    ["Asset", "Native NEAR"],
                    ["Amount", formatNearAmount(totalAtomic(review)) + " NEAR"],
                    ["Atomic amount", totalAtomic(review)],
                    ["Purpose", review.purpose],
                    ["Invoice", review.reference],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted">{label}</dt>
                      <dd className="break-all font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
                <Button
                  className="mt-5"
                  disabled={
                    disabled ||
                    !!pending ||
                    !!proposal ||
                    references.some((r) => r.draftId === draft.id) ||
                    !account ||
                    !treasury ||
                    treasury.id !== review.treasuryId ||
                    !available("proposePayment")
                  }
                  onClick={() =>
                    void run((signal, id) =>
                      write("proposePayment", id, (requestId) =>
                        requireService(services, "proposePayment")(
                          review,
                          requestId,
                          signal,
                        ),
                      ),
                    )
                  }
                >
                  Submit proposal
                </Button>
                <p className="mt-3 text-xs text-muted">
                  No proposal has been created by reviewing this draft.
                  Submission requires a connected account and authoritative
                  treasury.
                </p>
              </section>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="quiet"
                disabled={disabled || !drafts.some((d) => d.id === draft.id)}
                onClick={() => setDeleteConfirm(true)}
              >
                Delete selected draft
              </Button>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => setClearConfirm(true)}
              >
                Clear local drafts
              </Button>
            </div>
            {deleteConfirm && (
              <section className={card}>
                <p>
                  Delete this local draft? This does not cancel an on-chain
                  proposal.
                </p>
                <Button
                  className="mt-3"
                  onClick={() => {
                    try {
                      const next = drafts.filter((d) => d.id !== draft.id);
                      writeDrafts(next);
                      setDrafts(next);
                      edit(blank());
                      report("Local draft deleted.");
                    } catch {
                      report(
                        "Could not delete the draft. Existing storage is preserved.",
                        true,
                      );
                    }
                  }}
                >
                  Confirm draft deletion
                </Button>
                <Button variant="quiet" onClick={() => setDeleteConfirm(false)}>
                  Keep draft
                </Button>
              </section>
            )}
            {clearConfirm && (
              <section className={card}>
                <p>
                  Remove all invoice drafts from this browser? A pending action
                  record is retained for reconciliation.
                </p>
                <Button
                  className="mt-3"
                  onClick={() => {
                    try {
                      clearDrafts();
                      setDrafts([]);
                      setStorageError(false);
                      setReady(true);
                      edit(blank());
                      setClearConfirm(false);
                      report("Local drafts cleared.");
                    } catch {
                      report("Storage remains unavailable.", true);
                    }
                  }}
                >
                  Confirm clearing drafts
                </Button>
                <Button variant="quiet" onClick={() => setClearConfirm(false)}>
                  Keep local drafts
                </Button>
              </section>
            )}
          </div>
        )}
        {tab === "Account" && (
          <section className={card}>
            <h2 className="font-serif text-2xl">Account and recovery</h2>
            <p className="mt-3 break-all text-sm">
              {account ? account.accountId : "No account connected."}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              Object registration is a research comparison, not account
              authentication. Account creation and recovery need the agreed
              custody service.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                disabled={busy || !!pending || !available("openAccount")}
                onClick={() =>
                  void run((signal, id) =>
                    command(
                      "openAccount",
                      id,
                      (requestId) =>
                        requireService(services, "openAccount")(
                          requestId,
                          signal,
                        ),
                      (result) => {
                        setAccount(validateAccount(result));
                        report("Testnet account connected.");
                      },
                    ),
                  )
                }
              >
                Create or access account
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !!pending || !available("recoverAccount")}
                onClick={() =>
                  void run((signal, id) =>
                    command(
                      "recoverAccount",
                      id,
                      (requestId) =>
                        requireService(services, "recoverAccount")(
                          requestId,
                          signal,
                        ),
                      (result) => {
                        setAccount(validateAccount(result));
                        report("Account recovery service completed.");
                      },
                    ),
                  )
                }
              >
                Recover account
              </Button>
            </div>
          </section>
        )}
        {tab === "Team treasury" && (
          <section className={card}>
            <h2 className="font-serif text-2xl">Team treasury</h2>
            <label className="mt-4 block text-sm">
              Treasury to open
              <input
                className={field}
                value={treasuryId}
                onChange={(e) => {
                  cancel();
                  setTreasuryId(e.target.value);
                  setTreasury(null);
                  setProposal(null);
                  setEvidence(null);
                  setConsent(false);
                  setReceipts([]);
                }}
                autoCapitalize="none"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                disabled={
                  busy || !isAccountId(treasuryId) || !available("readTreasury")
                }
                onClick={() =>
                  void run(async (signal, id) => {
                    const result = await requireService(
                      services,
                      "readTreasury",
                    )(treasuryId, signal);
                    if (id !== generation.current) return;
                    const checked = validateTreasury(result);
                    if (checked.id !== treasuryId)
                      throw new Error("Wrong treasury response.");
                    setTreasury(checked);
                    report("Treasury policy loaded from its service.");
                  })
                }
              >
                Load authoritative treasury
              </Button>
              <Button
                variant="secondary"
                disabled={
                  busy ||
                  !!pending ||
                  !account ||
                  !available("joinTreasury") ||
                  !isAccountId(treasuryId)
                }
                onClick={() =>
                  void run((signal, id) =>
                    command(
                      "joinTreasury",
                      id,
                      (requestId) =>
                        requireService(services, "joinTreasury")(
                          treasuryId,
                          requestId,
                          signal,
                        ),
                      (result) => {
                        if (!["member", "requested"].includes(result.status))
                          throw new Error("Invalid membership response.");
                        report(
                          result.status === "member"
                            ? "Membership confirmed by service."
                            : "Membership requested; approval may still be pending.",
                        );
                      },
                    ),
                  )
                }
              >
                Request membership
              </Button>
            </div>
            {treasury ? (
              <div className="mt-5 space-y-2 text-sm">
                <p className="break-all">
                  {treasury.id} · Policy {treasury.policyVersion}
                </p>
                <p>Required approvals: {treasury.requiredApprovals}</p>
                <p>
                  Reported balance: {formatNearAmount(treasury.balanceAtomic)}{" "}
                  NEAR
                </p>
                <ul>
                  {treasury.members.map((m) => (
                    <li key={m.accountId} className="break-all">
                      {m.accountId} · {m.role}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-5 text-sm text-muted">
                No authoritative members, balance or threshold loaded.
              </p>
            )}
            <h3 className="mt-8 font-semibold">Create team treasury</h3>
            <label className="mt-3 block text-sm">
              Team name
              <input
                className={field}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={80}
              />
            </label>
            <label className="mt-3 block text-sm">
              Member accounts, one per line
              <textarea
                className={field}
                value={members}
                onChange={(e) => setMembers(e.target.value)}
                rows={3}
              />
            </label>
            <label className="mt-3 block text-sm">
              Required approvals
              <input
                className={field}
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </label>
            <Button
              className="mt-4"
              disabled={
                busy ||
                !!pending ||
                !account ||
                !teamName.trim() ||
                !available("createTreasury")
              }
              onClick={() =>
                void run(async (signal, id) => {
                  const memberAccountIds = members.split(/\s+/).filter(Boolean);
                  if (
                    !memberAccountIds.length ||
                    memberAccountIds.some((m) => !isAccountId(m)) ||
                    new Set(memberAccountIds).size !==
                      memberAccountIds.length ||
                    !Number.isInteger(threshold) ||
                    threshold < 1 ||
                    threshold > memberAccountIds.length
                  )
                    throw new Error("Check member accounts and threshold.");
                  await command(
                    "createTreasury",
                    id,
                    (requestId) =>
                      requireService(services, "createTreasury")(
                        {
                          name: teamName.trim(),
                          memberAccountIds,
                          requiredApprovals: threshold,
                          requestId,
                        },
                        signal,
                      ),
                    (result) => {
                      setTreasury(validateTreasury(result));
                      setTreasuryId(result.id);
                      report("Treasury creation confirmed by its service.");
                    },
                  );
                })
              }
            >
              Create treasury
            </Button>
          </section>
        )}
        {tab === "Approval session" && (
          <section className={card}>
            <h2 className="font-serif text-2xl">
              Review, acoustic exchange and consent
            </h2>
            <label className="mt-4 block text-sm">
              Existing proposal ID
              <input
                className={field}
                value={proposalId}
                onChange={(e) => {
                  cancel();
                  setProposalId(e.target.value);
                  setProposal(null);
                }}
                maxLength={200}
              />
            </label>
            <Button
              className="mt-3"
              disabled={
                busy || !treasury || !proposalId || !available("readProposal")
              }
              onClick={() =>
                void run(async (signal, id) => {
                  const result = await requireService(services, "readProposal")(
                    treasury!.id,
                    proposalId,
                    signal,
                  );
                  if (id === generation.current) {
                    const checked = validateProposal(result);
                    if (
                      checked.id !== proposalId ||
                      checked.treasuryId !== treasury!.id
                    )
                      throw new Error("Wrong proposal response.");
                    setProposal(checked);
                    setEvidence(null);
                    setConsent(false);
                    report(
                      "Proposal refreshed; review the current details again.",
                    );
                  }
                })
              }
            >
              Refresh proposal outcome
            </Button>
            {proposal ? (
              <dl className="mt-5 space-y-2 text-sm">
                {[
                  ["Proposal", proposal.id],
                  ["Content hash", proposal.contentHash],
                  ["Recipient", proposal.recipient],
                  ["Atomic amount", proposal.amountAtomic],
                  ["Status", proposal.status],
                  [
                    "Reported approvals",
                    proposal.approvals.join(", ") || "None",
                  ],
                  ["Required approvals", String(proposal.requiredApprovals)],
                  ["Expiry", proposal.expiresAt],
                ].map(([name, value]) => (
                  <div key={name}>
                    <dt className="text-muted">{name}</dt>
                    <dd className="break-all font-mono">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted">
                No authoritative proposal loaded.
              </p>
            )}
            <p className="mt-5 text-sm leading-6 text-muted">
              Start only when participants are ready. Listening is separate from
              approving payment. Sound exchange cannot guarantee an unrelayable
              room boundary.
            </p>
            <Button
              className="mt-4"
              disabled={
                busy ||
                !!pending ||
                !proposal ||
                proposal.status !== "pending" ||
                Date.parse(proposal.expiresAt) <= Date.now() ||
                !available("startAcousticSession")
              }
              onClick={() =>
                void run(async (signal, id) => {
                  setEvidence(null);
                  setConsent(false);
                  const result = await requireService(
                    services,
                    "startAcousticSession",
                  )(
                    proposal!,
                    (text) => {
                      if (id === generation.current) report(text);
                    },
                    signal,
                  );
                  if (id !== generation.current) return;
                  const checked = validateEvidence(result);
                  if (
                    checked.proposalId !== proposal!.id ||
                    result.contentHash !== proposal!.contentHash ||
                    Date.parse(result.expiresAt) <= Date.now()
                  )
                    throw new Error(
                      "Session does not match the current proposal.",
                    );
                  setEvidence(checked);
                  report(
                    "Acoustic exchange reported complete. Explicit approval is still required.",
                  );
                })
              }
            >
              Start acoustic exchange
            </Button>
            <label className="mt-5 flex min-h-12 items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={consent}
                disabled={!validEvidence || busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I reviewed the displayed recipient, exact amount, treasury and
              proposal and choose to approve this payment.
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                disabled={
                  busy ||
                  !!pending ||
                  !account ||
                  !proposal ||
                  !validEvidence ||
                  !consent ||
                  !available("approveProposal") ||
                  !!proposal?.approvals.includes(account?.accountId ?? "")
                }
                onClick={() =>
                  void run((signal, id) =>
                    write("approveProposal", id, (requestId) =>
                      requireService(services, "approveProposal")(
                        proposal!,
                        evidence!,
                        requestId,
                        signal,
                      ),
                    ),
                  )
                }
              >
                Approve exact proposal
              </Button>
              <Button
                variant="secondary"
                disabled={
                  busy ||
                  !!pending ||
                  !proposal ||
                  proposal.status !== "pending" ||
                  Date.parse(proposal.expiresAt) <= Date.now() ||
                  proposal.approvals.length < proposal.requiredApprovals ||
                  !available("executeProposal")
                }
                onClick={() =>
                  void run((signal, id) =>
                    write("executeProposal", id, (requestId) =>
                      requireService(services, "executeProposal")(
                        proposal!,
                        requestId,
                        signal,
                      ),
                    ),
                  )
                }
              >
                Execute approved payment
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              The authoritative service must independently enforce membership,
              signatures, session policy, expiry and duplicate prevention. UI
              controls are not a security boundary.
            </p>
          </section>
        )}
        {tab === "Receipts" && (
          <section className={card}>
            <h2 className="font-serif text-2xl">
              Receipts and invoice reconciliation
            </h2>
            <p className="mt-3 text-sm text-muted">
              {receipts.length
                ? "Only service-reconciled records are shown."
                : "No reconciled receipts loaded."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                disabled={busy || !treasury || !available("listReceipts")}
                onClick={() =>
                  void run(async (signal, id) => {
                    const result = await requireService(
                      services,
                      "listReceipts",
                    )(treasury!.id, signal);
                    receiptToCsv(result);
                    if (result.some((r) => r.network !== "testnet"))
                      throw new Error("Wrong receipt network.");
                    if (id === generation.current) {
                      setReceipts(result);
                      report("Reconciled receipt records loaded.");
                    }
                  })
                }
              >
                Refresh reconciled receipts
              </Button>
              <Button
                variant="secondary"
                disabled={busy || receipts.length === 0}
                onClick={() => {
                  try {
                    const blob = new Blob([receiptToCsv(receipts)], {
                      type: "text/csv;charset=utf-8",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "accoryn-reconciled-receipts.csv";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch {
                    report("Could not export the receipt records.", true);
                  }
                }}
              >
                Export reconciled receipts
              </Button>
            </div>
            <ul className="mt-5 space-y-4">
              {receipts.map((r, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-line p-4 text-sm"
                >
                  <p className="break-all">
                    {r.invoiceId ?? r.proposalId} · {r.status}
                  </p>
                  <p className="break-all">
                    {r.recipient} · {r.amountAtomic} atomic {r.asset}
                  </p>
                  <p className="break-all">
                    {r.transactionIds.join(", ") ||
                      "No transaction evidence yet"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <footer className="mt-8 flex flex-wrap gap-3 border-t border-line pt-5">
          <ActionLink href="/object-registration/" variant="quiet">
            Back to object registration
          </ActionLink>
          <ActionLink href="/device-check/" variant="quiet">
            Device checks
          </ActionLink>
        </footer>
      </main>
    </>
  );
}
