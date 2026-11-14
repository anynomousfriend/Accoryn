// Finds a member's vaults and the payments waiting in them from public
// testnet reads only: the Sputnik factory's DAO list, each candidate's
// policy, its recent proposals and the gate's meeting sessions. Nothing is
// shared by hand and nothing needs a backend: membership is public chain data,
// so anyone can run the same reads.
//
// Candidates are factory DAOs whose name matches the app's derived pattern
// (deriveDaoName: "<team slug>-<8 hex>", plus the "accoryn-" demo vaults); a
// vault counts only if its policy keeps transfer approval with the ceremony
// gate alone and lists this account as a member.
import { checkPolicyConformance } from "../near/policy.ts";
import {
  parseDescription,
  parseProposal,
  type SputnikPolicy,
} from "../near/sputnik.ts";
import { parseSession } from "./protocol.ts";

export type ViewReader = {
  viewFunction<T = unknown>(
    contractId: string,
    methodName: string,
    args?: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
};

export const FACTORY = "sputnikv2.testnet";
export const VAULT_NAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,18}[a-z0-9])?-[0-9a-f]{8}|accoryn-[a-z0-9-]+)\.sputnikv2\.testnet$/;
const PAGE = 2000;
/** Recent proposals checked per vault for waiting payments. */
const RECENT = 25;

export type DiscoveryCache = {
  version: 1;
  /** Factory DAOs already scanned (the list only grows). */
  scanned: number;
  candidates: string[];
};
export const emptyCache = (): DiscoveryCache => ({
  version: 1,
  scanned: 0,
  candidates: [],
});
/** A stored cache, or an empty one when it is missing or malformed. */
export function parseCache(raw: unknown): DiscoveryCache {
  const c = raw as Partial<DiscoveryCache> | null;
  if (
    !c ||
    c.version !== 1 ||
    !Number.isSafeInteger(c.scanned) ||
    (c.scanned as number) < 0 ||
    !Array.isArray(c.candidates) ||
    !c.candidates.every((n) => typeof n === "string" && VAULT_NAME.test(n))
  )
    return emptyCache();
  return { version: 1, scanned: c.scanned as number, candidates: [...c.candidates] };
}

/** Adds app vault names created since the cache was taken. */
export async function scanFactory(
  rpc: ViewReader,
  cache: DiscoveryCache,
  signal?: AbortSignal,
): Promise<DiscoveryCache> {
  const total = await rpc.viewFunction<number>(FACTORY, "get_number_daos", {}, { signal });
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("The vault factory returned a malformed count.");
  const start = total < cache.scanned ? 0 : cache.scanned;
  const found = new Set(start === 0 ? [] : cache.candidates);
  for (let from = start; from < total; from += PAGE) {
    const names = await rpc.viewFunction<unknown>(
      FACTORY,
      "get_daos",
      { from_index: from, limit: PAGE },
      { signal },
    );
    if (!Array.isArray(names))
      throw new Error("The vault factory returned a malformed list.");
    for (const name of names)
      if (typeof name === "string" && VAULT_NAME.test(name)) found.add(name);
  }
  return { version: 1, scanned: total, candidates: [...found] };
}

export type VaultSummary = { id: string; members: string[] };

/** Runs `job` over `items` with at most `limit` reads in flight. */
async function pooled<T, R>(items: T[], limit: number, job: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await job(items[i]);
      }
    }),
  );
  return out;
}

/** Ceremony-gated vaults among `candidates` that list `accountId` as a member. */
export async function memberVaults(
  rpc: ViewReader,
  accountId: string,
  candidates: string[],
  gateId: string,
  signal?: AbortSignal,
): Promise<{ vaults: VaultSummary[]; unreadable: number }> {
  let unreadable = 0;
  const checked = await pooled(candidates, 6, async (id) => {
    try {
      const policy = await rpc.viewFunction<unknown>(id, "get_policy", {}, { signal });
      const check = checkPolicyConformance(policy, { gateId });
      if (!check.ok || !check.members.includes(accountId)) return null;
      return { id, members: [...check.members].sort() };
    } catch {
      signal?.throwIfAborted();
      unreadable++;
      return null;
    }
  });
  return {
    vaults: checked
      .filter((v): v is VaultSummary => v !== null)
      .sort((a, b) => a.id.localeCompare(b.id)),
    unreadable,
  };
}

export type WaitingPayment = {
  treasuryId: string;
  proposalId: string;
  proposer: string;
  recipient: string;
  amountAtomic: string;
  purpose: string;
  /** Epoch milliseconds when the proposal stops accepting votes. */
  expiresAt: number;
  /** A host has an Open, unexpired meeting session for this payment now. */
  meetingOpen: boolean;
  meetingHost: string | null;
  /** Members who attested in the open meeting. */
  attended: string[];
};

/** Open native-NEAR transfer proposals in `dao`, newest first. */
export async function waitingPayments(
  rpc: ViewReader,
  dao: string,
  gateId: string,
  nowMs = Date.now(),
  signal?: AbortSignal,
): Promise<WaitingPayment[]> {
  const [policy, last] = await Promise.all([
    rpc.viewFunction<SputnikPolicy>(dao, "get_policy", {}, { signal }),
    rpc.viewFunction<number>(dao, "get_last_proposal_id", {}, { signal }),
  ]);
  if (!Number.isSafeInteger(last) || last < 0)
    throw new Error("The vault returned a malformed proposal count.");
  if (last === 0) return [];
  const from = Math.max(0, last - RECENT);
  const raw = await rpc.viewFunction<unknown[]>(
    dao,
    "get_proposals",
    { from_index: from, limit: last - from },
    { signal },
  );
  if (!Array.isArray(raw)) throw new Error("The vault returned malformed proposals.");
  const period = BigInt(policy.proposal_period);
  const open = raw.flatMap((item) => {
    try {
      const p = parseProposal(item);
      if (p.kind.kind !== "transfer" || p.kind.tokenId !== "" || p.status !== "InProgress")
        return [];
      const expiresAt = Number((BigInt(p.submissionTimeNs) + period) / 1_000_000n);
      if (expiresAt <= nowMs) return [];
      return [{ p, kind: p.kind, expiresAt }];
    } catch {
      return [];
    }
  });
  const payments = await Promise.all(
    open.map(async ({ p, kind, expiresAt }) => {
      let meetingOpen = false,
        meetingHost: string | null = null,
        attended: string[] = [];
      try {
        const raw = await rpc.viewFunction(
          gateId,
          "get_session",
          { dao_id: dao, proposal_id: p.id },
          { signal },
        );
        if (raw != null) {
          const s = parseSession(raw);
          if (s.status === "Open" && BigInt(s.expires_at) > BigInt(nowMs) * 1_000_000n) {
            meetingOpen = true;
            meetingHost = s.host;
            attended = s.attestations.map((a) => a.account_id);
          }
        }
      } catch {
        signal?.throwIfAborted();
      }
      return {
        treasuryId: dao,
        proposalId: String(p.id),
        proposer: p.proposer,
        recipient: kind.receiverId,
        amountAtomic: kind.amount,
        purpose: parseDescription(p.description).purpose,
        expiresAt,
        meetingOpen,
        meetingHost,
        attended,
      };
    }),
  );
  return payments.sort((a, b) => Number(b.proposalId) - Number(a.proposalId));
}
