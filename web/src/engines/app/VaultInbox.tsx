// "Your vaults" and "Payments waiting": what this member belongs to, found
// from public testnet reads (see discovery.ts), so nobody has to share a vault
// or payment ID by hand. Refreshes while the page is visible.
import { useEffect, useRef, useState } from "react";
import { Button } from "../../design/primitives.tsx";
import { formatNearAmount } from "../../workspace/drafts.ts";
import {
  emptyCache,
  memberVaults,
  parseCache,
  scanFactory,
  waitingPayments,
  type VaultSummary,
  type ViewReader,
  type WaitingPayment,
} from "./discovery.ts";

const CACHE_KEY = "accoryn.vault-discovery.v1";
export const INBOX_REFRESH_MS = 15_000;

function readCache() {
  try {
    return parseCache(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"));
  } catch {
    return emptyCache();
  }
}
function writeCache(cache: unknown) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A full or blocked store only costs a slower first scan next time.
  }
}

export type Inbox = {
  vaults: VaultSummary[];
  payments: WaitingPayment[];
  loaded: boolean;
  error: string | null;
};

/** This account's vaults and the payments waiting in them, kept current. */
export function useVaultInbox(
  rpc: ViewReader,
  account: string,
  gateId: string,
): Inbox & { refresh: () => void } {
  const empty: Inbox = { vaults: [], payments: [], loaded: false, error: null };
  const [state, setState] = useState<Inbox>(empty);
  const [tick, setTick] = useState(0);
  const shownFor = useRef("");
  useEffect(() => {
    // Another account's vaults must never show, even for one render.
    if (shownFor.current !== account) {
      shownFor.current = account;
      setState(empty);
    }
    if (!account) {
      setState(empty);
      return;
    }
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!stopped) timer = setTimeout(load, INBOX_REFRESH_MS);
    };
    async function load() {
      if (document.hidden) return schedule();
      try {
        const cache = await scanFactory(rpc, readCache(), controller.signal);
        writeCache(cache);
        const { vaults, unreadable } = await memberVaults(
          rpc,
          account,
          cache.candidates,
          gateId,
          controller.signal,
        );
        const lists = await Promise.all(
          vaults.map((v) =>
            waitingPayments(rpc, v.id, gateId, Date.now(), controller.signal).catch(
              () => [],
            ),
          ),
        );
        if (stopped) return;
        setState({
          vaults,
          payments: lists.flat(),
          loaded: true,
          error: unreadable
            ? `${unreadable} vault${unreadable === 1 ? "" : "s"} could not be read just now; retrying.`
            : null,
        });
      } catch {
        if (stopped) return;
        setState((s) => ({
          ...s,
          loaded: true,
          error: "Could not reach testnet to find your vaults; retrying.",
        }));
      }
      schedule();
    }
    void load();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [rpc, account, gateId, tick]);
  return { ...state, refresh: () => setTick((t) => t + 1) };
}

const shortVault = (id: string) => id.replace(/\.sputnikv2\.testnet$/, "");

export function VaultInbox({
  inbox,
  account,
  currentDao,
  currentProposal,
  busy,
  show,
  onOpenVault,
  onOpenPayment,
}: {
  inbox: Inbox;
  account: string;
  currentDao: string;
  currentProposal: string;
  busy: boolean;
  show: "dashboard" | "payments";
  onOpenVault: (id: string) => void;
  onOpenPayment: (dao: string, proposalId: string) => void;
}) {
  if (!account)
    return (
      <p className="text-sm text-muted">
        Sign in with your object to see the vaults you belong to and the
        payments waiting in them.
      </p>
    );
  if (!inbox.loaded)
    return (
      <p className="text-sm text-muted" aria-live="polite">
        Looking for your vaults and payments on testnet…
      </p>
    );
  const waiting = (dao: string) =>
    inbox.payments.filter((p) => p.treasuryId === dao).length;
  return (
    <div className="space-y-5">
      {show === "dashboard" && (
        <section aria-label="Your vaults" className="space-y-2">
          <h3 className="font-medium">Your vaults</h3>
          {inbox.vaults.length === 0 ? (
            <p className="text-sm text-muted">
              No vaults yet. When a teammate adds {account} to a vault, it
              appears here automatically.
            </p>
          ) : (
            <ul className="space-y-2">
              {inbox.vaults.map((v) => {
                const others = v.members.filter((m) => m !== account);
                const open = v.id === currentDao;
                return (
                  <li key={v.id} className="inbox-item">
                    <div className="min-w-0">
                      <p className="break-all font-medium">{shortVault(v.id)}</p>
                      <p className="text-xs text-muted">
                        With {others.join(", ") || "only you"} ·{" "}
                        {waiting(v.id)} waiting
                      </p>
                    </div>
                    <Button
                      variant={open ? "secondary" : "primary"}
                      disabled={busy || open}
                      onClick={() => onOpenVault(v.id)}
                    >
                      {open ? "Open now" : "Open vault"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      <section aria-label="Payments waiting" className="space-y-2">
        <h3 className="font-medium">Payments waiting for approval</h3>
        {inbox.payments.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing waiting. A payment proposed in any of your vaults appears
            here automatically.
          </p>
        ) : (
          <ul className="space-y-2">
            {inbox.payments.map((p) => {
              const current =
                p.treasuryId === currentDao && p.proposalId === currentProposal;
              const attended = p.attended.includes(account);
              return (
                <li key={p.treasuryId + "#" + p.proposalId} className="inbox-item">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {formatNearAmount(p.amountAtomic)} NEAR to {p.recipient}
                    </p>
                    <p className="break-words text-sm">{p.purpose}</p>
                    <p className="text-xs text-muted">
                      {shortVault(p.treasuryId)} · proposed by {p.proposer}
                    </p>
                    {p.meetingOpen && (
                      <p className="mt-1">
                        <span className="ui-status ui-status-warning">
                          Meeting open now · host {p.meetingHost}
                          {attended ? " · you approved" : ""}
                        </span>
                      </p>
                    )}
                  </div>
                  <Button
                    variant={current ? "secondary" : "primary"}
                    disabled={busy}
                    onClick={() => onOpenPayment(p.treasuryId, p.proposalId)}
                  >
                    {current ? "Opened" : p.meetingOpen ? "Join meeting" : "Review payment"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {inbox.error && <p className="text-xs text-muted">{inbox.error}</p>}
    </div>
  );
}
