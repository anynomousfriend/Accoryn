import { useEffect, useState } from "react";
import { SiteHeader, ActionLink, Button } from "../../design/primitives.tsx";
import {
  TreasuryEngine,
  GATE,
  GATE_HASH,
  type TreasuryView,
  type BoardEntry,
  type MemberParticipation,
} from "./engine.ts";
import { describeTiers, type GateLockStatus } from "./board.ts";
import { NearRpcClient } from "../near/rpc.ts";
import { Keystore, createMemoryKeyRecordStore } from "../near/keystore.ts";
import { TxJournal, createMemoryTxRecordStore } from "../near/txjournal.ts";
import { Operations, memoryOperationStore } from "./operations.ts";
import { formatNearAmount } from "../../workspace/drafts.ts";
import { receiptToCsv } from "../../payments/receipt-csv.ts";
/** Read-only route. It never reads the browser's signing-key database. */
export default function BoardPage() {
  const [dao, setDao] = useState(
    () => new URLSearchParams(location.search).get("dao") ?? "",
  );
  const [refresh, setRefresh] = useState(0);
  const [requested, setRequested] = useState(dao),
    [treasury, setTreasury] = useState<TreasuryView | null>(null),
    [entries, setEntries] = useState<BoardEntry[]>([]),
    [participation, setParticipation] = useState<MemberParticipation[]>([]),
    [gate, setGate] = useState<GateLockStatus | null>(null),
    [message, setMessage] = useState("Enter a testnet treasury account."),
    [busy, setBusy] = useState(false);
  const [engine] = useState(
    () =>
      new TreasuryEngine({
        rpc: new NearRpcClient(),
        keys: new Keystore(createMemoryKeyRecordStore()),
        journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
        operations: new Operations(memoryOperationStore()),
        authorize: async () => false,
      }),
  );
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    let active = true;
    setBusy(true);
    setEntries([]);
    setParticipation([]);
    setGate(null);
    setTreasury(null);
    setMessage("Loading chain state…");
    void (async () => {
      try {
        const t = await engine.treasury(requested, controller.signal);
        if (!active) return;
        setTreasury(t);
        const [keys, record] = await Promise.all([
          engine.gateKeys(controller.signal),
          engine.participation(requested, t.members, controller.signal),
        ]);
        if (!active) return;
        setGate(keys);
        setParticipation(record);
        const r = await engine.boardEntries(requested, controller.signal);
        if (active) {
          setEntries(r);
          setMessage(
            "Latest 50 proposals checked. Settled rows have independently verified payout receipts.",
          );
        }
      } catch (e) {
        if (active)
          setMessage(e instanceof Error ? e.message : "Chain lookup failed.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [requested, engine, refresh]);
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="page-shell max-w-4xl py-10 [overflow-wrap:anywhere]"
      >
        <h1 className="font-serif text-4xl">Treasury board</h1>
        <p className="my-4">
          Read-only NEAR testnet evidence. No scan, account or signing key is
          required.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRequested(dao);
            setRefresh((n) => n + 1);
            history.replaceState(
              null,
              "",
              "/board/?dao=" + encodeURIComponent(dao),
            );
          }}
        >
          <label className="block">
            Treasury account
            <input
              className="my-2 min-h-12 w-full rounded-lg border border-line p-3"
              value={dao}
              onChange={(e) => setDao(e.target.value)}
              autoCapitalize="none"
            />
          </label>
          <Button type="submit" disabled={busy || !dao}>
            Load board
          </Button>
        </form>
        <p role="status" className="my-5">
          {message}
        </p>
        {treasury && (
          <section className="my-5 rounded-xl border border-line bg-surface p-5">
            <h2 className="break-all font-serif text-2xl">{treasury.id}</h2>
            <p>Governance: {treasury.governanceApprovals} approvals</p>
            <p>Spendable: {formatNearAmount(treasury.spendableAtomic)} NEAR</p>
            <ul>
              {treasury.members.map((a) => (
                <li key={a} className="break-all">
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}
        {treasury && (
          <section className="my-5 rounded-xl border border-line bg-surface p-5">
            <h2 className="font-serif text-2xl">Who can approve payments</h2>
            <p className="break-all">
              Only <code>{GATE}</code> can approve transfers from this vault.
              Members propose, reject and finalize; the gate votes only after
              enough members attest in a live meeting. This was checked against
              the vault's on-chain policy just now.
            </p>
            <p className="break-all">
              Gate code hash (pinned): <code>{GATE_HASH}</code>
            </p>
            {gate && (
              <p>
                Gate upgrade keys:{" "}
                {gate.locked
                  ? "locked — the gate account has no access keys, so its code cannot change."
                  : `${gate.fullAccessKeys} developer full-access key${gate.fullAccessKeys === 1 ? "" : "s"} present — the developers can still upgrade the gate.`}
              </p>
            )}
            <p>
              Sputnik factory automatic upgrades:{" "}
              {factoryAutoUpdate(treasury.factoryInfo)}
            </p>
            <p>
              Governance (policy and member changes) needs{" "}
              {treasury.governanceApprovals} member approvals.
            </p>
          </section>
        )}
        {treasury && (
          <section className="my-5 rounded-xl border border-line bg-surface p-5">
            <h2 className="font-serif text-2xl">Amount tiers</h2>
            <p>
              Attendance depends on cumulative spend in a rolling{" "}
              {Math.round(treasury.tiers.window_secs / 3600)}-hour window,
              including the payment being approved. Spent in the current
              window: {formatNearAmount(treasury.tiers.window_spent)} NEAR.
            </p>
            <ul className="list-disc pl-6">
              {describeTiers(treasury.tiers.tiers, treasury.members.length).map(
                (line) => (
                  <li key={line}>{line}</li>
                ),
              )}
            </ul>
          </section>
        )}
        {participation.length > 0 && (
          <section className="my-5 rounded-xl border border-line bg-surface p-5">
            <h2 className="font-serif text-2xl">Participation record</h2>
            <p>
              Meetings each member attested in for this vault, recorded by the
              gate each time it approved a payment after a meeting.
            </p>
            <table className="mt-3 w-full text-left">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Meetings attended</th>
                  <th scope="col">Last proposal</th>
                  <th scope="col">Last attended</th>
                </tr>
              </thead>
              <tbody>
                {participation.map((m) => (
                  <tr key={m.accountId}>
                    <td className="break-all pr-3">{m.accountId}</td>
                    <td>{m.ceremonies}</td>
                    <td>{m.lastProposalId ?? "—"}</td>
                    <td>
                      {m.lastAtMs === null
                        ? "—"
                        : new Date(m.lastAtMs).toISOString().slice(0, 16) +
                          "Z"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <div className="space-y-3">
          {entries.map(({ row, attendees, required }) => (
            <article
              key={row.proposalId}
              className="rounded-xl border border-line p-4"
            >
              <h2>Proposal {row.proposalId}</h2>
              <p>{row.status}</p>
              <p className="break-all">
                Attested in the meeting:{" "}
                {attendees.length ? attendees.join(", ") : "nobody yet"} (
                {required} needed)
              </p>
              <p className="break-all">
                {formatNearAmount(row.amountAtomic)} native NEAR →{" "}
                {row.recipient}
              </p>
              <p>Invoice: {row.invoiceId ?? "none"}</p>
              {row.transactionIds.map((tx) => (
                <a
                  className="block break-all underline"
                  key={tx}
                  href={`https://testnet.nearblocks.io/txns/${tx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Verified payout {tx}
                </a>
              ))}
              <ActionLink
                variant="quiet"
                href={
                  "/treasury/?dao=" +
                  encodeURIComponent(row.treasuryId) +
                  "&proposal=" +
                  row.proposalId
                }
              >
                Review session and members
              </ActionLink>
            </article>
          ))}
        </div>
        <Button
          className="mt-4"
          disabled={!entries.length || busy}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([receiptToCsv(entries.map((e) => e.row))], {
                type: "text/csv;charset=utf-8",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "testnet-treasury-board.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download board CSV
        </Button>
      </main>
    </>
  );
}

function factoryAutoUpdate(info: unknown): string {
  const auto = (info as { auto_update?: unknown } | null)?.auto_update;
  if (auto === false)
    return "disabled — the factory owner cannot replace this vault's code.";
  if (auto === true)
    return "enabled — the factory owner can still upgrade this vault's code until members pass the hardening proposal.";
  return "unknown.";
}
