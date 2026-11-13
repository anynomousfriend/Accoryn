import type { SputnikPolicy } from "../near/sputnik.ts";
import { buildGatedPolicy, checkPolicyConformance } from "../near/policy.ts";
import { isTestnetAccountId, parseEd25519PublicKey } from "../near/keystore.ts";
export type Session = {
  session_id: string;
  dao_id: string;
  proposal_id: number;
  host: string;
  session_pk: string;
  receiver_id: string;
  amount: string;
  eligible: string[];
  attestations: { account_id: string; at: string }[];
  required: number;
  opened_at: string;
  expires_at: string;
  status: "Open" | "Expired" | "Executing" | "Voted" | "Cancelled";
  last_error: string | null;
  evidence_txs: string[];
};
const decimal = (v: unknown): v is string =>
  typeof v === "string" && /^(0|[1-9][0-9]{0,38})$/.test(v);
export function parseSession(raw: unknown): Session {
  const s = raw as Session;
  if (
    !s ||
    typeof s !== "object" ||
    !decimal(s.session_id) ||
    !isTestnetAccountId(s.dao_id) ||
    !isTestnetAccountId(s.host) ||
    !isTestnetAccountId(s.receiver_id) ||
    !Number.isSafeInteger(s.proposal_id) ||
    s.proposal_id < 0 ||
    !parseEd25519PublicKey(s.session_pk) ||
    !decimal(s.amount) ||
    !decimal(s.opened_at) ||
    !decimal(s.expires_at) ||
    BigInt(s.expires_at) <= BigInt(s.opened_at) ||
    !Array.isArray(s.eligible) ||
    s.eligible.length < 2 ||
    s.eligible.some((a) => !isTestnetAccountId(a)) ||
    new Set(s.eligible).size !== s.eligible.length ||
    !Number.isInteger(s.required) ||
    s.required < 1 ||
    s.required > s.eligible.length ||
    !Array.isArray(s.attestations) ||
    s.attestations.some(
      (a) => !s.eligible.includes(a.account_id) || !decimal(a.at),
    ) ||
    new Set(s.attestations.map((a) => a.account_id)).size !==
      s.attestations.length ||
    !["Open", "Expired", "Executing", "Voted", "Cancelled"].includes(
      s.status,
    ) ||
    !Array.isArray(s.evidence_txs) ||
    s.evidence_txs.some(
      (t) => typeof t !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t),
    )
  )
    throw new Error("Malformed ceremony session.");
  return structuredClone(s);
}
export function assertSessionFor(
  s: Session,
  p: {
    treasuryId: string;
    id: string;
    recipient: string;
    amountAtomic: string;
  },
  actor: string,
  now = Date.now(),
): void {
  if (
    s.dao_id !== p.treasuryId ||
    String(s.proposal_id) !== p.id ||
    s.receiver_id !== p.recipient ||
    s.amount !== p.amountAtomic ||
    !s.eligible.includes(actor) ||
    s.status !== "Open" ||
    BigInt(s.expires_at) <= BigInt(now) * 1_000_000n
  )
    throw new Error(
      "Ceremony is expired, unavailable or does not match this member and payment.",
    );
}
export function membershipPolicy(
  policy: SputnikPolicy,
  members: string[],
  gate: string,
): SputnikPolicy {
  const check = checkPolicyConformance(policy, { gateId: gate });
  if (!check.ok) throw new Error("Cannot change an ungated policy.");
  return buildGatedPolicy({
    members,
    gateId: gate,
    proposalPeriodNs: policy.proposal_period,
  });
}
export function assertCurrentMembership(s:Session,members:string[]):void{if(JSON.stringify([...s.eligible].sort())!==JSON.stringify([...members].sort()))throw new Error('Vault membership changed. Cancel or expire the old session, then open a new one.');}
