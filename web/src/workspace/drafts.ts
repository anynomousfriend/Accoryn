export type InvoiceLine = {
  description: string;
  quantity: number;
  unitAmount: string;
};
export type PaymentDraft = {
  id: string;
  reference: string;
  treasuryId: string;
  recipient: string;
  purpose: string;
  dueDate: string;
  lines: InvoiceLine[];
  updatedAt: string;
};
const exactKeys = (v: object, keys: string[]) =>
  Object.keys(v).sort().join("|") === keys.sort().join("|");
export function isAccountId(value: string): boolean {
  return (
    value.length >= 2 &&
    value.length <= 64 &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)
  );
}
export function parseNearAmount(value: string): string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/^\d+(?:\.\d{1,24})?$/.test(value)
  )
    throw new Error(
      "Enter a plain NEAR amount with at most 24 decimal places.",
    );
  const [whole, fraction = ""] = value.split(".");
  const atomic = BigInt(whole) * 10n ** 24n + BigInt(fraction.padEnd(24, "0"));
  if (atomic > (1n << 128n) - 1n) throw new Error("Amount is too large.");
  return atomic.toString();
}
export function totalAtomic(draft: Pick<PaymentDraft, "lines">): string {
  const total = draft.lines.reduce(
    (sum, l) =>
      sum + BigInt(parseNearAmount(l.unitAmount)) * BigInt(l.quantity),
    0n,
  );
  if (total > (1n << 128n) - 1n) throw new Error("Total is too large.");
  return total.toString();
}
export function formatNearAmount(atomic: string): string {
  if (!/^(0|[1-9]\d*)$/.test(atomic)) throw new Error("Invalid atomic amount.");
  const padded = atomic.padStart(25, "0");
  const fraction = padded.slice(-24).replace(/0+$/, "");
  return padded.slice(0, -24) + (fraction ? "." + fraction : "");
}
export function validateDraft(value: unknown): PaymentDraft {
  const error = () => {
    throw new Error(
      "Draft is incomplete or incompatible. Check invoice details, accounts, dates and positive line amounts.",
    );
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return error();
  const d = value as PaymentDraft;
  if (
    !exactKeys(d, [
      "id",
      "reference",
      "treasuryId",
      "recipient",
      "purpose",
      "dueDate",
      "lines",
      "updatedAt",
    ])
  )
    return error();
  if (
    typeof d.id !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      d.id,
    )
  )
    return error();
  for (const [text, max] of [
    [d.reference, 100],
    [d.purpose, 500],
  ] as const)
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > max ||
      /[\u0000-\u001f]/.test(text)
    )
      return error();
  if (
    typeof d.treasuryId !== "string" ||
    typeof d.recipient !== "string" ||
    !isAccountId(d.treasuryId) ||
    !isAccountId(d.recipient)
  )
    return error();
  if (
    typeof d.dueDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate) ||
    !Number.isFinite(Date.parse(d.dueDate)) ||
    new Date(d.dueDate).toISOString().slice(0, 10) !== d.dueDate
  )
    return error();
  if (
    typeof d.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(d.updatedAt))
  )
    return error();
  if (!Array.isArray(d.lines) || d.lines.length < 1 || d.lines.length > 20)
    return error();
  for (const l of d.lines) {
    if (
      !l ||
      typeof l !== "object" ||
      !exactKeys(l, ["description", "quantity", "unitAmount"]) ||
      typeof l.description !== "string" ||
      !l.description.trim() ||
      l.description.length > 120 ||
      !Number.isInteger(l.quantity) ||
      l.quantity < 1 ||
      l.quantity > 1000000 ||
      BigInt(parseNearAmount(l.unitAmount)) <= 0n
    )
      return error();
  }
  totalAtomic(d);
  return structuredClone(d);
}
export function encodeDrafts(drafts: readonly PaymentDraft[]): string {
  if (drafts.length > 50) throw new Error("Keep at most 50 local drafts.");
  const valid = drafts.map(validateDraft);
  if (new Set(valid.map((d) => d.id)).size !== valid.length)
    throw new Error("Duplicate draft IDs.");
  return JSON.stringify({ version: 1, drafts: valid });
}
export function decodeDrafts(raw: string | null): PaymentDraft[] {
  if (raw === null) return [];
  if (raw.length > 1000000)
    throw new Error("Local draft storage is too large.");
  const data = JSON.parse(raw);
  if (
    !data ||
    !exactKeys(data, ["version", "drafts"]) ||
    data.version !== 1 ||
    !Array.isArray(data.drafts)
  )
    throw new Error("Local draft storage is incompatible.");
  encodeDrafts(data.drafts);
  return data.drafts.map(validateDraft);
}
