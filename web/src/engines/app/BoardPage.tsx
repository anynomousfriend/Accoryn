import { useEffect, useState } from "react";
import { SiteHeader, ActionLink, Button } from "../../design/primitives.tsx";
import { TreasuryEngine, type TreasuryView } from "./engine.ts";
import { NearRpcClient } from "../near/rpc.ts";
import { Keystore, createMemoryKeyRecordStore } from "../near/keystore.ts";
import { TxJournal, createMemoryTxRecordStore } from "../near/txjournal.ts";
import { Operations, memoryOperationStore } from "./operations.ts";
import { formatNearAmount } from "../../workspace/drafts.ts";
import {
  receiptToCsv,
  type ReceiptExportRow,
} from "../../payments/receipt-csv.ts";
/** Read-only route. It never reads the browser's signing-key database. */
export default function BoardPage() {
  const [dao, setDao] = useState(
    () => new URLSearchParams(location.search).get("dao") ?? "",
  );
  const [refresh, setRefresh] = useState(0);
  const [requested, setRequested] = useState(dao),
    [treasury, setTreasury] = useState<TreasuryView | null>(null),
    [rows, setRows] = useState<ReceiptExportRow[]>([]),
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
    setRows([]);
    setTreasury(null);
    setMessage("Loading chain state…");
    void (async () => {
      try {
        const t = await engine.treasury(requested, controller.signal);
        if (!active) return;
        setTreasury(t);
        const r = await engine.receipts(requested, controller.signal);
        if (active) {
          setRows(r);
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
            <p>
              Gate tier version: {treasury.tiers.version}; cumulative spend:{" "}
              {formatNearAmount(treasury.tiers.window_spent)} NEAR.
            </p>
            <ul>
              {treasury.members.map((a) => (
                <li key={a} className="break-all">
                  {a}
                </li>
              ))}
            </ul>
            <p>Factory configuration: {JSON.stringify(treasury.factoryInfo)}</p>
          </section>
        )}
        <div className="space-y-3">
          {rows.map((row) => (
            <article
              key={row.proposalId}
              className="rounded-xl border border-line p-4"
            >
              <h2>Proposal {row.proposalId}</h2>
              <p>{row.status}</p>
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
          disabled={!rows.length || busy}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([receiptToCsv(rows)], {
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
