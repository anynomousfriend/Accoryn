import { ProposalReview } from "./ProposalReview.tsx";
import {
  makeActionIntent,
  validateFinancialProposal,
  validateReconciliation,
  type ActionInput,
} from "./action-policy.ts";
import {
  validateAccount,
  validateTreasury,
  validateProposal,
  validateEvidence,
} from "../integration/validation.ts";
import { useCallback, useEffect, useRef, useState } from "react";
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
  saveDraft,
  deleteDraft,
  draftRevision,
  rememberProposalReference,
  clearDrafts,
  readProposalRefs,
  type ProposalRef,
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
  const [baseRevision, setBaseRevision] = useState<string | null>(null);
  const [guardError, setGuardError] = useState(false);
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
    hasService(services, name) &&
    (!guardError ||
      [
        "readTreasury",
        "readProposal",
        "listReceipts",
        "reconcileAction",
      ].includes(name));
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
  const refreshGuards = useCallback(() => {
    let failed = false;
    try {
      setPending(readPendingAction());
    } catch {
      failed = true;
    }
    try {
      setReferences(readProposalRefs());
    } catch {
      failed = true;
    }
    setGuardError(failed);
  }, []);
  useEffect(() => {
    refreshGuards();
    try {
      setDrafts(readDrafts());
      setStorageError(false);
    } catch {
      setStorageError(true);
      report(
        "Local draft data is incompatible or unavailable. Stored drafts were not overwritten.",
        true,
      );
    }
    setReady(true);
    const changed = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      refreshGuards();
      if (event.key === "accoryn.payment-drafts.v1" || event.key === null) {
        try {
          setDrafts(readDrafts());
          setStorageError(false);
        } catch {
          setStorageError(true);
        }
      }
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        cancel();
        report(
          "Stopped locally. Reconcile any pending action before submitting again.",
        );
      }
    };
    window.addEventListener("storage", changed);
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("pagehide", cancel);
      document.removeEventListener("visibilitychange", hidden);
      generation.current++;
      operation.current?.abort();
      services.releaseResources?.();
    };
  }, [services, refreshGuards]);
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
  const edit = (value: PaymentDraft, base?: string | null) => {
    if (base !== undefined) setBaseRevision(base);
    else if (value.id !== draft.id) setBaseRevision(null);
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
  const save = async () => {
    const id = ++generation.current;
    setBusy(true);
    try {
      if (readProposalRefs().some((r) => r.draftId === draft.id))
        throw new Error(
          "This draft already has a proposal reference. Create a new draft for a different payment.",
        );
      const valid = validateDraft({
        ...draft,
        updatedAt: new Date().toISOString(),
      });
      const next = await saveDraft(valid, baseRevision);
      if (id !== generation.current) return;
      setDraft(valid);
      setBaseRevision(draftRevision(valid));
      setDrafts(next);
      report("Draft saved locally. No payment submitted.");
    } catch (e) {
      if (id === generation.current)
        report(
          e instanceof Error ? e.message : "Could not save this draft.",
          true,
        );
    } finally {
      if (id === generation.current) setBusy(false);
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
    input: ActionInput,
    id: number,
    job: (requestId: string) => Promise<T>,
    apply: (
      value: T,
      intent: PendingAction,
    ) => Promise<boolean | void> | boolean | void,
  ) => {
    if (guardError || !ready)
      throw new Error("Protected storage must be reconciled before an action.");
    const intent = makeActionIntent(
      input,
      crypto.randomUUID(),
      new Date().toISOString(),
    );
    const signal = operation.current?.signal;
    await beginAction(intent, signal);
    setPending(intent);
    if (id !== generation.current) return;
    const result = await job(intent.requestId);
    if (id !== generation.current) return;
    const confirmed = await apply(result, intent);
    if (id !== generation.current) return;
    if (confirmed !== false) {
      await finishAction(intent.requestId);
      if (id === generation.current) setPending(null);
    } else
      report(
        "Action outcome is not confirmed. Reconcile before another submission.",
      );
  };
  const write = async (
    input: Extract<
      ActionInput,
      { kind: "proposePayment" | "approveProposal" | "executeProposal" }
    >,
    id: number,
    job: (requestId: string) => Promise<Proposal>,
  ) =>
    command(input, id, job, async (value, intent) => {
      const result = validateFinancialProposal(intent, value);
      if (intent.draftId) {
        const next = await rememberProposalReference({
          draftId: intent.draftId,
          treasuryId: result.treasuryId,
          proposalId: result.id,
          contentHash: result.contentHash,
        });
        if (id !== generation.current) return false;
        setReferences(next);
      }
      setProposal(result);
      setProposalId(result.id);
      setEvidence(null);
      setConsent(false);
      report("Authoritative proposal state: " + result.status + ".");
      return actionConfirmed(input.kind, result.status);
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
              style={{ transition: "none" }}
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
        {guardError && (
          <section className={card + " mb-5"}>
            <h2 className="font-semibold">
              Protected action data needs recovery
            </h2>
            <p className="mt-2 text-sm">
              Financial actions stay blocked. Clearing invoice drafts does not
              remove protected records.
            </p>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={refreshGuards}
            >
              Retry protected storage
            </Button>
          </section>
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
                  const decision = validateReconciliation(pending, result);
                  if (decision.reference) {
                    const next = await rememberProposalReference(
                      decision.reference,
                    );
                    if (id !== generation.current) return;
                    setReferences(next);
                  }
                  if (id !== generation.current) return;
                  if (decision.proposal) {
                    setProposal(decision.proposal);
                    setProposalId(decision.proposal.id);
                  }
                  if (decision.account) setAccount(decision.account);
                  if (decision.treasury) {
                    setTreasury(decision.treasury);
                    setTreasuryId(decision.treasury.id);
                  }
                  if (decision.clear) {
                    await finishAction(pending.requestId);
                    if (id === generation.current) setPending(null);
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
                    onClick={() => edit(structuredClone(d), draftRevision(d))}
                  >
                    Open {d.reference}
                  </Button>
                ))}
              </div>
            </section>
            {references.length > 0 && (
              <section className={card}>
                <h2 className="font-serif text-2xl">
                  Submitted proposal references
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Stored references are not proof of payment. Open one to
                  refresh its authoritative outcome.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {references.map((ref) => (
                    <Button
                      key={ref.draftId}
                      variant="secondary"
                      onClick={() => {
                        cancel();
                        setTreasury(null);
                        setTreasuryId(ref.treasuryId);
                        setProposal(null);
                        setProposalId(ref.proposalId);
                        setTab("Approval session");
                      }}
                    >
                      Open submitted proposal {ref.proposalId}
                    </Button>
                  ))}
                </div>
              </section>
            )}
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
                      write(
                        { kind: "proposePayment", draft: review },
                        id,
                        (requestId) =>
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
                  onClick={async () => {
                    setBusy(true);
                    report("Deleting local draft…");
                    try {
                      const next = await deleteDraft(draft.id, baseRevision);
                      setDrafts(next);
                      edit(blank());
                      report("Local draft deleted.");
                    } catch (e) {
                      report(
                        e instanceof Error
                          ? e.message
                          : "Could not delete the draft. Existing storage is preserved.",
                        true,
                      );
                    } finally {
                      setBusy(false);
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
                  onClick={async () => {
                    setBusy(true);
                    report("Clearing local drafts…");
                    try {
                      await clearDrafts();
                      refreshGuards();
                      setDrafts([]);
                      setStorageError(false);
                      setReady(true);
                      edit(blank());
                      setClearConfirm(false);
                      report("Local drafts cleared.");
                    } catch {
                      report("Storage remains unavailable.", true);
                    } finally {
                      setBusy(false);
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
                      { kind: "openAccount" },
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
                      { kind: "recoverAccount" },
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
                      { kind: "joinTreasury", treasuryId },
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
                    { kind: "createTreasury" },
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
                busy ||
                !isAccountId(treasuryId) ||
                !proposalId ||
                !available("readProposal")
              }
              onClick={() =>
                void run(async (signal, id) => {
                  const result = await requireService(services, "readProposal")(
                    treasuryId,
                    proposalId,
                    signal,
                  );
                  if (id === generation.current) {
                    const checked = validateProposal(result);
                    if (
                      checked.id !== proposalId ||
                      checked.treasuryId !== treasuryId
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
              <ProposalReview proposal={proposal} />
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
                    write(
                      {
                        kind: "approveProposal",
                        proposal: proposal!,
                        actor: account?.accountId ?? null,
                        refs: readProposalRefs(),
                      },
                      id,
                      (requestId) =>
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
                    write(
                      {
                        kind: "executeProposal",
                        proposal: proposal!,
                        actor: account?.accountId ?? null,
                        refs: readProposalRefs(),
                      },
                      id,
                      (requestId) =>
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
