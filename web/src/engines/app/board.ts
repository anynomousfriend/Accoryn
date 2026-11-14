// Pure presentation helpers for public, keyless treasury evidence. They parse
// chain views strictly and never infer a rule the gate did not return.
import { formatNearAmount } from "../../workspace/drafts.ts";
import type { AccessKeyListEntry } from "../near/rpc.ts";

export type TierRule = { up_to: string; required: number };
export type Participation = {
  ceremonies: number;
  lastAtMs: number | null;
  lastProposalId: string | null;
};
export type GateLockStatus = {
  locked: boolean;
  fullAccessKeys: number;
  functionCallKeys: number;
};

const MAX_MEMBERS = 16;
const atomic = /^(0|[1-9][0-9]*)$/;

/** Mirrors `TierConfig::required` in the gate: each tier is capped at the team
 * size, and cumulative spend above the highest tier needs every member. */
export function describeTiers(
  tiers: readonly TierRule[],
  memberCount: number,
): string[] {
  if (!Number.isInteger(memberCount) || memberCount < 1)
    throw new Error("Invalid member count.");
  const all = Math.min(memberCount, MAX_MEMBERS);
  let previous = -1n;
  const lines = tiers.map((tier) => {
    if (
      !tier ||
      typeof tier.up_to !== "string" ||
      !atomic.test(tier.up_to) ||
      !Number.isInteger(tier.required) ||
      tier.required < 1
    )
      throw new Error("Malformed tier.");
    const limit = BigInt(tier.up_to);
    if (limit <= previous) throw new Error("Tiers must increase.");
    previous = limit;
    return `Up to ${formatNearAmount(tier.up_to)} NEAR: ${Math.min(tier.required, all)} of ${all} members`;
  });
  const last = tiers.at(-1);
  lines.push(
    last
      ? `Above ${formatNearAmount(last.up_to)} NEAR: all ${all} members`
      : `Any amount: all ${all} members`,
  );
  return lines;
}

export function parseParticipation(raw: unknown): Participation {
  const v = raw as {
    ceremonies?: unknown;
    last_at?: unknown;
    last_proposal_id?: unknown;
  } | null;
  if (
    !v ||
    typeof v !== "object" ||
    !Number.isSafeInteger(v.ceremonies) ||
    (v.ceremonies as number) < 0 ||
    typeof v.last_at !== "string" ||
    !atomic.test(v.last_at) ||
    !Number.isSafeInteger(v.last_proposal_id) ||
    (v.last_proposal_id as number) < 0
  )
    throw new Error("Malformed participation record.");
  const ceremonies = v.ceremonies as number;
  if (ceremonies === 0)
    return { ceremonies, lastAtMs: null, lastProposalId: null };
  return {
    ceremonies,
    lastAtMs: Number(BigInt(v.last_at) / 1_000_000n),
    lastProposalId: String(v.last_proposal_id),
  };
}

export function gateLockStatus(
  keys: readonly AccessKeyListEntry[],
): GateLockStatus {
  const fullAccessKeys = keys.filter(
    (k) => k.permission === "FullAccess",
  ).length;
  return {
    locked: keys.length === 0,
    fullAccessKeys,
    functionCallKeys: keys.length - fullAccessKeys,
  };
}
