// Settlement truth for a ceremony-gated payout.
//
// The gate's vote succeeding is not proof of payment: Sputnik executes the
// transfer in a separate receipt that can fail on its own. A payout counts as
// settled only when the final transaction outcome contains exactly one
// successful DAO -> recipient Transfer of the exact amount and the proposal is
// Approved. Anything else is reported, never assumed.

export type SettlementExpectation = {
  daoId: string;
  receiverId: string;
  amountAtomic: string;
  proposalStatus: string;
};

export type SettlementCheck =
  | { ok: true; txHash: string; receiptId: string }
  | {
      ok: false;
      reason:
        | "MALFORMED"
        | "NOT_FINAL"
        | "NO_TRANSFER"
        | "MULTIPLE_TRANSFERS"
        | "TRANSFER_FAILED"
        | "PROPOSAL_NOT_APPROVED";
    };

type Receipt = {
  receipt_id: string;
  predecessor_id: string;
  receiver_id: string;
  receipt?: { Action?: { actions?: unknown[] } };
};
type ReceiptOutcome = { id: string; outcome: { status: Record<string, unknown> } };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function transferDeposit(action: unknown): string | null {
  if (!isObject(action) || !isObject(action.Transfer)) return null;
  const deposit = action.Transfer.deposit;
  return typeof deposit === "string" ? deposit : null;
}

export function verifySettlement(txStatus: unknown, expected: SettlementExpectation): SettlementCheck {
  if (
    !isObject(txStatus) ||
    !Array.isArray(txStatus.receipts) ||
    !Array.isArray(txStatus.receipts_outcome) ||
    !isObject(txStatus.transaction) ||
    typeof txStatus.transaction.hash !== "string"
  )
    return { ok: false, reason: "MALFORMED" };
  if (txStatus.final_execution_status !== "FINAL") return { ok: false, reason: "NOT_FINAL" };

  const receipts = txStatus.receipts as Receipt[];
  const matching = receipts.filter(
    (receipt) =>
      isObject(receipt) &&
      receipt.predecessor_id === expected.daoId &&
      receipt.receiver_id === expected.receiverId &&
      (receipt.receipt?.Action?.actions ?? []).some((action) => transferDeposit(action) === expected.amountAtomic),
  );
  if (matching.length === 0) return { ok: false, reason: "NO_TRANSFER" };
  if (matching.length > 1) return { ok: false, reason: "MULTIPLE_TRANSFERS" };

  const [transfer] = matching;
  const outcome = (txStatus.receipts_outcome as ReceiptOutcome[]).find(
    (candidate) => isObject(candidate) && candidate.id === transfer.receipt_id,
  );
  const status = outcome?.outcome?.status;
  if (!isObject(status) || !("SuccessValue" in status || "SuccessReceiptId" in status))
    return { ok: false, reason: "TRANSFER_FAILED" };
  if (expected.proposalStatus !== "Approved") return { ok: false, reason: "PROPOSAL_NOT_APPROVED" };
  return { ok: true, txHash: txStatus.transaction.hash, receiptId: transfer.receipt_id };
}
