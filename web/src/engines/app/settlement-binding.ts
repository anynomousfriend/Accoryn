import {
  verifySettlement,
  type SettlementExpectation,
  type SettlementCheck,
} from "../near/settlement.ts";
export type BoundSettlement = SettlementExpectation & {
  gateId: string;
  proposalId: string;
  sessionId: string;
};
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === "object" && !Array.isArray(value);
function call(actions: unknown, method: string): ObjectValue | null {
  if (
    !Array.isArray(actions) ||
    actions.length !== 1 ||
    !object(actions[0]) ||
    !object(actions[0].FunctionCall)
  )
    return null;
  const f = actions[0].FunctionCall;
  if (
    f.method_name !== method ||
    typeof f.args !== "string" ||
    f.args.length > 16384
  )
    return null;
  try {
    const bytes = Uint8Array.from(atob(f.args), (c) => c.charCodeAt(0));
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return object(value) ? value : null;
  } catch {
    return null;
  }
}
/** The transfer amount alone cannot identify an invoice. Bind its receipt to
 * this exact gate execute -> DAO VoteApprove -> descendant Transfer chain. */
export function verifyProposalSettlement(
  tx: unknown,
  expected: BoundSettlement,
): SettlementCheck | { ok: false; reason: "UNBOUND_PROPOSAL" } {
  const transfer = verifySettlement(tx, expected);
  if (!transfer.ok) return transfer;
  const unbound = { ok: false, reason: "UNBOUND_PROPOSAL" } as const;
  if (
    !object(tx) ||
    !object(tx.transaction) ||
    !object(tx.transaction_outcome) ||
    !Array.isArray(tx.receipts) ||
    !Array.isArray(tx.receipts_outcome)
  )
    return unbound;
  const transaction = tx.transaction,
    root = tx.transaction_outcome;
  const execute = call(transaction.actions, "execute");
  if (
    transaction.receiver_id !== expected.gateId ||
    !execute ||
    execute.dao_id !== expected.daoId ||
    String(execute.proposal_id) !== expected.proposalId ||
    !Number.isSafeInteger(execute.proposal_id) ||
    root.id !== transaction.hash ||
    !object(root.outcome)
  )
    return unbound;
  const outcomes = new Map<string, ObjectValue>();
  for (const item of tx.receipts_outcome) {
    if (
      !object(item) ||
      typeof item.id !== "string" ||
      !object(item.outcome) ||
      outcomes.has(item.id)
    )
      return unbound;
    outcomes.set(item.id, item.outcome);
  }
  const receiptIds = new Set<string>();
  for (const r of tx.receipts) {
    if (
      !object(r) ||
      typeof r.receipt_id !== "string" ||
      receiptIds.has(r.receipt_id)
    )
      return unbound;
    receiptIds.add(r.receipt_id);
  }
  const reachable = (outcome: ObjectValue, target: string): boolean => {
    const queue = Array.isArray(outcome.receipt_ids)
      ? [...outcome.receipt_ids]
      : [];
    const visited = new Set<string>();
    while (queue.length) {
      const id = queue.pop();
      if (typeof id !== "string" || visited.has(id)) continue;
      if (id === target) return true;
      visited.add(id);
      const child = outcomes.get(id);
      if (child && Array.isArray(child.receipt_ids))
        queue.push(...child.receipt_ids);
    }
    return false;
  };
  const votes = tx.receipts.filter((r) => {
    if (
      !object(r) ||
      r.predecessor_id !== expected.gateId ||
      r.receiver_id !== expected.daoId ||
      !object(r.receipt) ||
      !object(r.receipt.Action)
    )
      return false;
    const args = call(r.receipt.Action.actions, "act_proposal");
    if (
      !args ||
      !Number.isSafeInteger(args.id) ||
      String(args.id) !== expected.proposalId ||
      args.action !== "VoteApprove" ||
      typeof args.memo !== "string" ||
      !args.memo.startsWith(
        `accoryn-ceremony:v1:session=${expected.sessionId}:attendees=`,
      )
    )
      return false;
    const outcome = outcomes.get(String(r.receipt_id));
    return (
      !!outcome &&
      reachable(root.outcome as ObjectValue, String(r.receipt_id)) &&
      reachable(outcome, transfer.receiptId)
    );
  });
  return votes.length === 1 ? transfer : unbound;
}
