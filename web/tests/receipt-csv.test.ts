import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptToCsv } from "../src/payments/receipt-csv.ts";
const receipt = {
  network: "testnet",
  treasuryId: "team.testnet",
  proposalId: "42",
  invoiceId: "INV-1",
  recipient: "supplier.testnet",
  asset: "NEAR",
  amountAtomic: "1000000000000000000000001",
  decimals: 24,
  status: "settled" as const,
  createdAt: "2026-11-13T00:00:00.000Z",
  updatedAt: "2026-11-13T00:01:00.000Z",
  transactionIds: ["verified-transaction-reference"],
};
test("receipt CSV preserves atomic precision, status and transaction evidence", () => {
  assert.equal(
    receiptToCsv([receipt]),
    '"network","treasury_id","proposal_id","invoice_id","recipient","asset","amount_atomic","decimals","status","created_at","updated_at","transaction_ids"\r\n"testnet","team.testnet","42","INV-1","supplier.testnet","NEAR","1000000000000000000000001","24","settled","2026-11-13T00:00:00.000Z","2026-11-13T00:01:00.000Z","verified-transaction-reference"\r\n',
  );
});
test("untrusted CSV values cannot break rows or execute spreadsheet formulas", () => {
  const csv = receiptToCsv([
    {
      ...receipt,
      invoiceId: ' =HYPERLINK("evil")',
      asset: 'Coin, "quoted"\nname',
      recipient: "\t+1",
    },
  ]);
  assert.ok(csv.includes('"\' =HYPERLINK(""evil"")"'));
  assert.ok(csv.includes('"Coin, ""quoted""\nname"'));
  assert.ok(csv.includes('"\'\t+1"'));
});
test("pending and unknown outcomes are not exported as settled", () => {
  for (const status of [
    "pending",
    "unknown",
    "failed",
    "refunded",
    "rejected",
  ] as const) {
    const csv = receiptToCsv([{ ...receipt, status, transactionIds: [] }]);
    assert.ok(csv.includes('"' + status + '"'));
    assert.ok(!csv.includes('"settled"'));
  }
  assert.throws(() => receiptToCsv([{ ...receipt, transactionIds: [] }]));
  assert.throws(() => receiptToCsv([{ ...receipt, amountAtomic: "1.5" }]));
  assert.throws(() => receiptToCsv([{ ...receipt, decimals: -1 }]));
});
