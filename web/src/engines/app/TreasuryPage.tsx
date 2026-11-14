import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  MemberRoster,
  PaymentFacts,
  ApprovalProgress,
} from "../../design/WorkflowPreview.tsx";
import { Button, ActionLink } from "../../design/primitives.tsx";
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
import { TemplateStore } from "../../object-registration/template-store.ts";
import ObjectRegistrationPage from "../../object-registration/ObjectRegistrationPage.tsx";
import type { ObjectTemplate } from "../../object-registration/types.ts";
import {
  memberTemplateKey,
  acknowledgeComparison,
  validObjectCheck,
  type ObjectCheck,
  type ObjectCheckContext,
} from "./member-object.ts";
import {
  GuidedWorkspace,
  taskFromHash,
  type Task,
} from "./GuidedWorkspace.tsx";
import { loadedVaultId } from "./vault-context.ts";
import { useDemoUsers } from "./useDemoUsers.ts";
import { MemberUserPicker } from "./DemoUserPickers.tsx";
import {
  readPendingAction,
  beginAction,
  finishAction,
  type PendingAction,
} from "../../workspace/action-journal.ts";
import { VaultPaymentEditor } from "./VaultPaymentEditor.tsx";
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
  totalAtomic,
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
  reference: "PAY-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
  treasuryId,
  recipient: "",
  purpose: "",
  dueDate: new Date().toISOString().slice(0, 10),
  lines: [{ description: "", quantity: 1, unitAmount: "" }],
  updatedAt: new Date().toISOString(),
});
const field =
  "mt-1 min-h-12 w-full rounded-lg border border-line bg-surface p-3 text-base";
const writesEnabled =
  (import.meta as ImportMeta & { env: { VITE_ENABLE_TESTNET_WRITES?: string } })
    .env.VITE_ENABLE_TESTNET_WRITES === "1";
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="workspace-panel">
      <h2 className="mb-4 font-serif text-2xl">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
export default function TreasuryPage() {
  const { directory, publish: shareDemoUser, publication } = useDemoUsers();
  const activeUntil = useRef(0);
  const approvalGuard = useRef<(() => Promise<boolean>) | null>(null);
  const [task, setTask] = useState<Task>(() => taskFromHash(location.hash));
  const [accountPath, setAccountPath] = useState<"create" | "saved">("create");
  const [vaultStep, setVaultStep] = useState<
    "open" | "name" | "members" | "review"
  >("open");
  const [memberTemplate, setMemberTemplate] = useState<ObjectTemplate | null>(
    null,
  );
  const [objectCheck, setObjectCheck] = useState<ObjectCheck | null>(null);
  const checkRef = useRef<ObjectCheck | null>(null);
  checkRef.current = objectCheck;
  function showTask(next: Task) {
    setTask(next);
    history.pushState(
      null,
      "",
      location.pathname + location.search + "#" + next,
    );
  }
  const [engine] = useState(
    () =>
      new TreasuryFlow({
        keys: new Keystore(),
        journal: new TxJournal(),
        operations: new Operations(indexedOperationStore()),
        rpc: new NearRpcClient(),
        authorize: async () =>
          activeUntil.current > Date.now() &&
          (!approvalGuard.current || (await approvalGuard.current())),
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
    setObjectCheck(null);
    checkRef.current = null;
    approvalGuard.current = null;
  }
  function lock() {
    stop();
    activeUntil.current = 0;
    engine.accountId = null;
    setUnlocked(false);
    setAccount("");
    setMessage(
      "Browser session ended. Start it again and choose your saved local account to continue. Any pending request is retained.",
    );
    showTask("account");
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
      if (activeUntil.current && activeUntil.current <= Date.now()) lock();
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
      approvalGuard.current = null;
    };
  }, [engine]);
  useEffect(() => {
    setObjectCheck(null);
    checkRef.current = null;
    setMemberTemplate(null);
    if (!account || !treasury?.members.includes(account)) return;
    let disposed = false;
    const scoped = new TemplateStore(memberTemplateKey(treasury.id, account));
    void scoped
      .read()
      .then((t) => {
        if (!disposed) setMemberTemplate(t);
      })
      .catch(() => {
        if (!disposed)
          setMessage(
            "Member object storage could not be read. Open Members to repair it.",
          );
      })
      .finally(() => scoped.close());
    return () => {
      disposed = true;
    };
  }, [account, treasury?.id]);
  useEffect(() => {
    setNewMembers(treasury?.members.join("\n") ?? "");
  }, [treasury?.id]);
  useEffect(() => {
    const changed = () => {
      if (!busyRef.current) {
        stop();
        setTask(taskFromHash(location.hash));
      }
    };
    window.addEventListener("hashchange", changed);
    window.addEventListener("popstate", changed);
    return () => {
      window.removeEventListener("hashchange", changed);
      window.removeEventListener("popstate", changed);
    };
  }, []);
  useEffect(() => {
    document.title = task[0].toUpperCase() + task.slice(1) + " · Team Treasury";
  }, [task]);
  function navigate(next: Task) {
    if (busyRef.current) return;
    stop();
    showTask(next);
  }
  function startBrowserSession() {
    activeUntil.current = Date.now() + 600_000;
    setUnlocked(true);
    setMessage(
      "Browser session started for 10 minutes. Choose or create your testnet account.",
    );
  }
  const isMember = !!account && !!treasury?.members.includes(account);
  function checkContext(
    template: ObjectTemplate | null,
  ): ObjectCheckContext | null {
    if (
      !template ||
      !account ||
      !treasury ||
      !payment?.session ||
      !isMember ||
      payment.proposal.treasuryId !== treasury.id ||
      payment.session.status !== "Open" ||
      payment.proposal.status !== "pending"
    )
      return null;
    return {
      accountId: account,
      vaultId: treasury.id,
      proposalId: payment.proposal.id,
      contentHash: payment.proposal.contentHash,
      sessionId: payment.session.session_id,
      sessionExpiresAt: Number(BigInt(payment.session.expires_at) / 1_000_000n),
      templateId: template.id,
      modelRevision: JSON.stringify(template.model),
    };
  }
  const contextRef = useRef<ReturnType<typeof checkContext>>(null);
  contextRef.current = checkContext(memberTemplate);
  async function validateFreshObject(): Promise<boolean> {
    const context = contextRef.current;
    if (!context || !validObjectCheck(checkRef.current, context)) return false;
    const scoped = new TemplateStore(
      memberTemplateKey(context.vaultId, context.accountId),
    );
    try {
      const template = await scoped.read();
      return (
        !!template &&
        template.id === context.templateId &&
        JSON.stringify(template.model) === context.modelRevision &&
        !!contextRef.current &&
        validObjectCheck(checkRef.current, contextRef.current) &&
        validObjectCheck(checkRef.current, context)
      );
    } finally {
      scoped.close();
    }
  }
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
        approvalGuard.current = null;
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
      if (treasury?.id !== result.treasuryId) {
        setTreasury(null);
        setPayment(null);
        setMemberTemplate(null);
        setObjectCheck(null);
        checkRef.current = null;
        setReceipts([]);
        setGovernance(null);
      }
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
    if (op.kind === "attest") {
      if (!(await validateFreshObject()))
        throw new Error(
          "Compare your enrolled member object for this exact payment session before approval.",
        );
      signal.throwIfAborted();
      approvalGuard.current = validateFreshObject;
    }
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
      shareDemoUser(op.actor);
      setLocalAccounts((old) => [...new Set([...old, op.actor])]);
      showTask("vault");
    }
    setHeard(false);
    setConsent(false);
    await apply(result, id, signal);
    if (result.status === "confirmed") {
      if (op.kind === "create") {
        setVaultStep("open");
        showTask("object");
      }
      if (op.kind === "propose") showTask("approvals");
    }
    if (op.kind === "attest") {
      setObjectCheck(null);
      checkRef.current = null;
    }
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
    <GuidedWorkspace
      task={task}
      account={account}
      vault={treasury?.id ?? ""}
      busy={busy}
      onNavigate={navigate}
      onLock={lock}
    >
      <div className="workspace-heading">
        <p className="eyebrow-label">
          {task === "account"
            ? "Begin with your own account"
            : "Your workspace / NEAR testnet"}
        </p>
        <h1>
          {
            {
              account: "Your account",
              vault: "A home for shared decisions.",
              object: "Members & verification",
              payment: "Prepare a payment.",
              approvals: "Approve together.",
              activity: "Every payment, accounted for.",
              settings: "Manage your vault.",
            }[task]
          }
        </h1>
        <p>
          {
            {
              account:
                "Create a testnet account or continue with one saved on this device.",
              vault:
                "Open an existing vault or create one with your partners. Each member uses their own account.",
              object:
                "Your vault partners, and your personal object. Each member enrolls on their own device.",
              payment:
                "Choose a recipient and explain the payment. You review the exact details before anything is submitted.",
              approvals:
                "Review the payment, exchange the sound challenge, then sign your own approval.",
              activity:
                "Only a verified successful transfer counts as a payout. Share the read-only record with your team.",
              settings:
                "Advanced governance and recovery. These actions can change how the vault is controlled.",
            }[task]
          }
        </p>
      </div>
      {!writesEnabled && (unlocked || task !== "account") && (
        <p className="mt-4">
          Testnet writes disabled in this build. Start the local server with
          VITE_ENABLE_TESTNET_WRITES=1 to enable them.
        </p>
      )}
      <div className="workspace-session">
        <span className={unlocked ? "session-dot active" : "session-dot"} />
        <span>
          {unlocked ? "Browser session active" : "Start a session to continue"}
        </span>
        <span className="text-muted">{account || "No account selected"}</span>
      </div>
      {publication && (
        <p className="my-3 text-xs leading-5 text-muted">{publication}</p>
      )}
      <p
        id="workspace-status"
        role="status"
        className={
          "workspace-status " +
          (failed ? "workspace-status-error" : "") +
          (task === "account" &&
          message ===
            "Read-only lookup is available. No transaction has been signed."
            ? " hidden"
            : "")
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
          <p>
            Reloading does not authorize another submission. For a submitted
            member approval, reconcile its original outcome here; a new approval
            requires a new scan and sound exchange.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async (s, id) => {
                const result = await engine.reconcile(pending.requestId, s);
                const op = await engine.deps.operations.get(pending.requestId);
                if (op?.kind === "account" && result.status === "confirmed") {
                  setLocalAccounts((old) => [...new Set([...old, op.actor])]);
                  shareDemoUser(op.actor);
                }
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
            disabled={
              busy || !unlocked || !writesEnabled || pending.kind === "attest"
            }
            onClick={() =>
              void run(async (s, id) => {
                const op = await engine.deps.operations.get(pending.requestId);
                if (!op) throw new Error("No matching engine intent.");
                if (op.kind === "account") {
                  await engine.createAccount(op.actor, op.requestId, s);
                  await finishAction(op.requestId);
                  if (sequence.current === id) {
                    setAccount(op.actor);
                    setLocalAccounts((old) => [...new Set([...old, op.actor])]);
                    shareDemoUser(op.actor);
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
      <div hidden={task !== "account"}>
        <Section title="Choose how to continue">
          <div className="account-paths" aria-label="Account options">
            <Button
              variant={accountPath === "create" ? "primary" : "secondary"}
              onClick={() => setAccountPath("create")}
              aria-pressed={accountPath === "create"}
            >
              Create account
            </Button>
            <Button
              variant={accountPath === "saved" ? "primary" : "secondary"}
              onClick={() => setAccountPath("saved")}
              aria-pressed={accountPath === "saved"}
            >
              Use saved account
            </Button>
          </div>
          {!unlocked && (
            <div className="onboarding-notice">
              <h3>Start with this browser</h3>
              <p>
                Testnet signing keys stay unencrypted in this browser. Clearing
                its data loses access; there is no cross-device recovery. Object
                scans do not create these keys.
              </p>
              <Button onClick={startBrowserSession}>
                Start browser session
              </Button>
            </div>
          )}
          {unlocked && (
            <p className="text-sm text-muted">
              Session expires after 10 minutes. If it ends, start it again and
              select your existing local account.
            </p>
          )}
          <p>
            Use a unique name for a new NEAR testnet account. Saved accounts
            need their signing key on this device.
          </p>
          <div hidden={accountPath !== "create"} className="space-y-4">
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
          </div>
          <div hidden={accountPath !== "saved"} className="space-y-4">
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
                    shareDemoUser(a);
                    setMessage("Local key confirmed as FullAccess on testnet.");
                    showTask("vault");
                  }
                })
              }
            >
              Use local account
            </Button>
          </div>
          <p className="break-all text-sm text-muted">
            Current signer: {account || "none"}
          </p>
        </Section>
      </div>
      <div hidden={task !== "vault"}>
        <Section title="Your shared vault">
          <div className="flex flex-wrap gap-3 mb-5">
            <Button
              variant={vaultStep === "open" ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => setVaultStep("open")}
            >
              Open a vault
            </Button>
            <Button
              variant={vaultStep !== "open" ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => setVaultStep("name")}
            >
              Create a vault
            </Button>
          </div>
          <div hidden={vaultStep !== "open"}>
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
                    setMessage(
                      "Authoritative treasury policy loaded. " +
                        (t.members.includes(account)
                          ? "You are a member. Enroll your object next."
                          : "Read-only vault loaded. Select a member account to participate."),
                    );
                  }
                })
              }
            >
              Load treasury
            </Button>
            {treasury && (
              <div className="vault-overview space-y-2 text-sm">
                <p className="break-all">{treasury.id}</p>
                <p>
                  Governance approvals: {treasury.governanceApprovals} of{" "}
                  {treasury.members.length}
                </p>
                <p>
                  Account balance: {formatNearAmount(treasury.balanceAtomic)}{" "}
                  NEAR
                </p>
                <p>
                  Spendable: {formatNearAmount(treasury.spendableAtomic)} NEAR
                </p>
                <ul>
                  {treasury.members.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <details>
                  <summary className="min-h-12 cursor-pointer py-3">
                    Approval policy and technical details
                  </summary>
                  <p>
                    Gate tiers version {treasury.tiers.version}; rolling spend{" "}
                    {formatNearAmount(treasury.tiers.window_spent)} NEAR in
                    window {treasury.tiers.window_id}. Attendance is calculated
                    on-chain for each payment and cumulative spend.
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
                    Factory configuration:{" "}
                    {JSON.stringify(treasury.factoryInfo)}
                  </p>
                </details>
                <div className="flex flex-wrap gap-3 pt-4">
                  <Button
                    disabled={!isMember || !unlocked}
                    onClick={() => navigate("object")}
                  >
                    {memberTemplate
                      ? "View your member object"
                      : "Next: enroll your object"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => navigate("payment")}
                  >
                    Prepare payment
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => navigate("approvals")}
                  >
                    Open approvals
                  </Button>
                </div>
                <label className="block pt-4">
                  Member invitation link
                  <input
                    className={field}
                    readOnly
                    value={
                      location.origin +
                      "/treasury/?dao=" +
                      encodeURIComponent(treasury.id) +
                      "#account"
                    }
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <p className="text-xs text-muted">
                  Send this public link to your partners. They select their own
                  account, open the vault and enroll their own object. Other
                  members’ local enrollment status is not visible here.
                </p>
              </div>
            )}
          </div>
          {vaultStep !== "open" && (
            <p className="eyebrow-label">
              Create vault ·{" "}
              {vaultStep === "name"
                ? "1 / 3 · Name"
                : vaultStep === "members"
                  ? "2 / 3 · Members"
                  : "3 / 3 · Review"}
            </p>
          )}
          <div hidden={vaultStep !== "name"}>
            <label className="block">
              Team name
              <input
                className={field}
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              />
            </label>
            <Button
              disabled={!team.trim()}
              onClick={() => setVaultStep("members")}
            >
              Next: members
            </Button>
          </div>
          <div hidden={vaultStep !== "members"}>
            <p>
              Your account {account || "(select an account first)"} is included
              automatically. Add at least one partner’s full testnet username
              below.
            </p>
            {task === "vault" && vaultStep === "members" && (
              <MemberUserPicker
                directory={directory}
                value={members}
                onChange={setMembers}
                creator={account}
                disabled={busy}
              />
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setVaultStep("name")}>
                Back to name
              </Button>
              <Button
                disabled={!members.trim()}
                onClick={() => setVaultStep("review")}
              >
                Review vault
              </Button>
            </div>
          </div>
          <div hidden={vaultStep !== "review"}>
            <h3 className="font-serif text-2xl">Review your vault</h3>
            <p className="mt-3 font-semibold">{team}</p>
            <ul className="my-4 space-y-2">
              {[
                ...new Set(
                  [account, ...members.trim().split(/\s+/)].filter(Boolean),
                ),
              ].map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <p>
              Creation attaches 6 testnet NEAR to the Sputnik factory. Include
              yourself and at least one other member. Humans govern; only the
              gate approves native Transfer proposals. Governance can change
              policy and is an explicit escape hatch.
            </p>
            <Button
              disabled={blocked || !account || !team}
              onClick={() =>
                buttonOp(() =>
                  planTreasury(crypto.randomUUID(), account, team, [
                    ...new Set(
                      [account, ...members.trim().split(/\s+/)].filter(Boolean),
                    ),
                  ]),
                )
              }
            >
              Create shared vault — 6 testnet NEAR
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setVaultStep("members")}
            >
              Back to members
            </Button>
          </div>
          <div
            hidden={vaultStep !== "open" || !treasury}
            className="mt-6 border-t border-line pt-5"
          >
            <h3 className="mb-3 font-semibold">Fund your vault</h3>
            <p className="mb-3 text-sm text-muted">
              Transfers testnet NEAR from your selected account to the loaded
              vault. This is separate from creating a payment request.
            </p>
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
              disabled={blocked || !account || !treasury || treasury.id !== dao}
              onClick={() =>
                buttonOp(() => {
                  const amount = parseNearAmount(fundAmount);
                  if (BigInt(amount) <= 0n)
                    throw new Error("Enter a positive amount.");
                  return {
                    requestId: crypto.randomUUID(),
                    kind: "fund",
                    actor: account,
                    receiver: loadedVaultId(treasury, dao),
                    args: {},
                    deposit: amount,
                  };
                })
              }
            >
              Fund loaded vault
            </Button>
          </div>
        </Section>
      </div>
      <div hidden={task !== "object"}>
        <Section title="Your member enrollment">
          {treasury && (
            <>
              <MemberRoster
                members={treasury.members}
                currentAccount={account}
              />
              <p className="text-sm text-muted">
                Each member enrolls on their own device. Other members’ local
                scan status is not shared.
              </p>
            </>
          )}
          {!isMember ? (
            <p>
              Select your account and open a vault to enroll your member object.
            </p>
          ) : (
            task === "object" && (
              <ObjectRegistrationPage
                key={account + treasury!.id}
                member={{
                  accountId: account,
                  vaultId: treasury!.id,
                  approval: false,
                  onTemplate: setMemberTemplate,
                  onComparisonReset: () => setObjectCheck(null),
                  onAcknowledge: () => {},
                }}
              />
            )
          )}
          <Button
            disabled={!isMember || !memberTemplate}
            onClick={() => navigate("payment")}
          >
            Continue to payment
          </Button>
          {isMember && !memberTemplate && (
            <p className="text-sm text-muted">
              Capture and save three views to continue. Each vault member must
              do this on their own device.
            </p>
          )}
        </Section>
      </div>
      <div id="invoice" hidden={task !== "payment"}>
        <Section title="Invoice payment">
          {(!account || !treasury) && (
            <p className="next-step-note">
              Select your Account, then open a vault in Overview. The payment
              form will use that vault automatically.
            </p>
          )}
          {isMember && !memberTemplate && (
            <p className="next-step-note">
              Enroll your member object before submitting a payment from this
              workspace.{" "}
              <button className="underline" onClick={() => navigate("object")}>
                Go to Members
              </button>
            </p>
          )}
          <Button
            disabled={busy || !treasury}
            variant="secondary"
            onClick={() => {
              setInvoice(blankInvoice(treasury!.id));
              setInvoiceBase(null);
              setDraftId("");
              setReviewed(false);
            }}
          >
            New invoice
          </Button>
          {invoice && (
            <VaultPaymentEditor
              key={invoice.id}
              draft={invoice}
              directory={directory}
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
                if (!saved || draftRevision(saved) !== draftRevision(invoice)) {
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
            Prepare and save an invoice here, or select a previously saved local
            draft. Saved drafts remain local until explicitly submitted.
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
              <PaymentFacts
                recipient={draft.recipient}
                amount={formatNearAmount(totalAtomic(draft))}
                purpose={draft.purpose}
              />
              <dl className="break-all text-sm">
                <dt>Treasury</dt>
                <dd>{draft.treasuryId}</dd>
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
                  !isMember ||
                  !memberTemplate ||
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
        </Section>
      </div>
      <div hidden={task !== "approvals"}>
        <Section title="Payment review and approvals">
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
              <PaymentFacts
                recipient={payment.proposal.recipient}
                amount={formatNearAmount(payment.proposal.amountAtomic)}
                purpose={payment.proposal.purpose}
              />
              <p className="mt-3 text-xs text-muted">
                Atomic amount: {payment.proposal.amountAtomic}
              </p>
              <p>Hash: {payment.proposal.contentHash}</p>
              <p>Expires: {payment.proposal.expiresAt}</p>
              <p>
                Attestations: {payment.proposal.approvals.join(", ") || "none"};
                required: {payment.proposal.requiredApprovals}
              </p>
              {payment.session && (
                <p>
                  Session {payment.session.session_id}: {payment.session.status}
                  ; expires{" "}
                  {new Date(
                    Number(BigInt(payment.session.expires_at) / 1_000_000n),
                  ).toISOString()}
                  ; host {payment.session.host}; last error{" "}
                  {payment.session.last_error ?? "none"}
                </p>
              )}
            </div>
          )}
          {!payment && <p className="next-step-note">No payment loaded</p>}
          {payment && (
            <div className="next-step-note">
              <ApprovalProgress
                approvals={payment.proposal.approvals.length}
                required={payment.proposal.requiredApprovals}
              />
              <p className="mt-2">
                {payment.proposal.status === "settled"
                  ? "Payout verified. Publish its evidence below, then open Completed & records to share the receipt."
                  : !paymentOpen
                    ? "This payment is no longer open. Check Completed & records for its authoritative outcome."
                    : !sessionOpen
                      ? "Next: a member opens the host session. Partners then load this payment on their own devices."
                      : payment.proposal.approvals.length >=
                          payment.proposal.requiredApprovals
                        ? "The required approvals are present. Refresh the payment, then execute it once."
                        : payment.proposal.approvals.includes(account)
                          ? "Your approval is recorded. Wait for your partners, then refresh this payment."
                          : !isMember
                            ? "Select a current member account and open this vault to participate."
                            : !objectCheck ||
                                !contextRef.current ||
                                !validObjectCheck(
                                  objectCheck,
                                  contextRef.current,
                                  now,
                                )
                              ? "Next: compare your enrolled object below and acknowledge the research limits."
                              : !heard
                                ? payment.session?.host === account
                                  ? "Ask partners to tap Listen first, then play the host sound."
                                  : "Tap Listen, then ask the host to play the sound."
                                : "Review the exact payment, check your consent and sign your member approval."}
              </p>
            </div>
          )}
          {payment && (
            <label className="block mt-4 text-sm">
              Payment invitation link
              <input
                readOnly
                className={field}
                onFocus={(e) => e.target.select()}
                value={
                  location.origin +
                  "/treasury/?dao=" +
                  encodeURIComponent(dao) +
                  "&proposal=" +
                  encodeURIComponent(proposalId) +
                  "#account"
                }
              />
            </label>
          )}
        </Section>
        <Section title="Meet, scan and approve">
          <p>
            The host opens a five-minute session (0.1 testnet NEAR deposit).
            Other vault members tap Listen before the host plays. Each
            participant then explicitly approves. Use built-in speakers and
            microphones.
          </p>
          <Button
            disabled={blocked || !isMember || !paymentOpen || !!sessionOpen}
            onClick={() =>
              buttonOp(() => engine.planOpen(payment!, crypto.randomUUID()))
            }
          >
            Open host session — 0.1 testnet NEAR
          </Button>
          <div className="approval-step">
            <p className="eyebrow-label">1 · Fresh member object check</p>
            {!sessionOpen ? (
              <p className="mt-2 text-sm">
                Load a pending payment and open its host session first. Then
                compare your member object for that exact session.
              </p>
            ) : !isMember ? (
              <p>Select a current vault member account to participate.</p>
            ) : (
              task === "approvals" && (
                <ObjectRegistrationPage
                  key={JSON.stringify([
                    account,
                    treasury!.id,
                    payment!.proposal.id,
                    payment!.proposal.contentHash,
                    payment!.session!.session_id,
                  ])}
                  member={{
                    accountId: account,
                    vaultId: treasury!.id,
                    approval: true,
                    onTemplate: setMemberTemplate,
                    onComparisonReset: () => {
                      setObjectCheck(null);
                      checkRef.current = null;
                    },
                    onAcknowledge: (template, comparison, comparedAt) => {
                      const context = checkContext(template);
                      if (!context) {
                        setMessage(
                          "Load the current payment and session first.",
                        );
                        return;
                      }
                      try {
                        const check = acknowledgeComparison(
                          context,
                          comparison.topTwoMean,
                          comparedAt,
                        );
                        if (!validObjectCheck(check, context))
                          throw new Error("Comparison expired. Scan again.");
                        setObjectCheck(check);
                        checkRef.current = check;
                        setMessage(
                          "Demo object match recorded for this payment. Continue with the sound exchange.",
                        );
                      } catch (e) {
                        setMessage(
                          e instanceof Error ? e.message : "Scan again.",
                        );
                      }
                    },
                  }}
                />
              )
            )}
            <p className="mt-3 text-sm font-semibold">
              {objectCheck &&
              contextRef.current &&
              validObjectCheck(objectCheck, contextRef.current, now)
                ? "Demo object match active"
                : "A fresh comparison is required before your approval"}
            </p>
          </div>
          <p className="eyebrow-label">2 · Exchange sound</p>
          <div className="flex flex-wrap gap-3">
            {(["host", "listener"] as const).map((role) => (
              <Button
                key={role}
                disabled={
                  blocked ||
                  !isMember ||
                  !sessionOpen ||
                  (role === "host"
                    ? payment?.session?.host !== account
                    : payment?.session?.host === account)
                }
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
          <p className="eyebrow-label">3 · Your explicit approval</p>
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
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                blocked ||
                !account ||
                !heard ||
                !consent ||
                !sessionOpen ||
                !contextRef.current ||
                !validObjectCheck(objectCheck, contextRef.current, now) ||
                !!payment?.proposal.approvals.includes(account)
              }
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
          </div>
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
      </div>
      <div hidden={task !== "settings"}>
        <Section title="Governance and member recovery">
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
          {task === "settings" && (
            <MemberUserPicker
              directory={directory}
              value={newMembers}
              onChange={setNewMembers}
              known={treasury?.members}
              manualLabel="Complete next member list"
              disabled={busy}
            />
          )}
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
      </div>
      <div hidden={task !== "activity"}>
        <Section title="Receipts and read-only board">
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
      </div>
    </GuidedWorkspace>
  );
}
