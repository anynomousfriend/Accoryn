/** App export boundary. The authoritative adapter must reconcile these records;
 * this formatter does not verify a chain transaction or manufacture receipts. */
export type ReceiptExportRow = {
  network: string;
  treasuryId: string;
  proposalId: string;
  invoiceId: string | null;
  recipient: string;
  asset: string;
  amountAtomic: string;
  decimals: number;
  status: "pending" | "unknown" | "failed" | "refunded" | "rejected" | "settled";
  createdAt: string;
  updatedAt: string;
  transactionIds: readonly string[];
};
const headers = [
  "network",
  "treasury_id",
  "proposal_id",
  "invoice_id",
  "recipient",
  "asset",
  "amount_atomic",
  "decimals",
  "status",
  "created_at",
  "updated_at",
  "transaction_ids",
];
function cell(value: string): string {
  if (value.length > 16384 || value.includes("\0"))
    throw new Error("Invalid receipt export field.");
  const safe =
    /^[\s\u0000-\u001f]*[=+@-]/u.test(value) || /^[\t\r\n]/.test(value)
      ? "'" + value
      : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function receiptToCsv(receipts: readonly ReceiptExportRow[]): string {
  const rows = receipts.map((r) => {
    if (
      !/^(0|[1-9][0-9]{0,127})$/.test(r.amountAtomic) ||
      !Number.isInteger(r.decimals) ||
      r.decimals < 0 ||
      r.decimals > 255
    )
      throw new Error("Invalid atomic amount or decimals.");
    if (
      ![
        "pending",
        "unknown",
        "failed",
        "refunded",
        "rejected",
        "settled",
      ].includes(
        r.status,
      )
    )
      throw new Error("Unknown payment state.");
    if (
      !Array.isArray(r.transactionIds) ||
      r.transactionIds.some((id) => typeof id !== "string" || !id.trim()) ||
      (r.status === "settled" && r.transactionIds.length === 0)
    )
      throw new Error("Settled receipts require transaction evidence.");
    for (const date of [r.createdAt, r.updatedAt])
      if (!Number.isFinite(Date.parse(date)))
        throw new Error("Invalid receipt timestamp.");
    const values = [
      r.network,
      r.treasuryId,
      r.proposalId,
      r.invoiceId ?? "",
      r.recipient,
      r.asset,
      r.amountAtomic,
      String(r.decimals),
      r.status,
      r.createdAt,
      r.updatedAt,
      r.transactionIds.join(";"),
    ];
    if (values.some((value) => typeof value !== "string"))
      throw new Error("Invalid receipt export field.");
    return values.map(cell).join(",");
  });
  return [headers.map(cell).join(","), ...rows].join("\r\n") + "\r\n";
}
