import { Button } from "../design/primitives.tsx";
import { formatNearAmount, totalAtomic, type PaymentDraft } from "./drafts.ts";
const field =
  "mt-1 min-h-12 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-base text-ink";
export function DraftEditor({
  draft,
  onChange,
  onSave,
  onReview,
  disabled,
  readOnly = false,
}: {
  draft: PaymentDraft;
  onChange: (value: PaymentDraft) => void;
  onSave: () => void;
  onReview: () => void;
  disabled: boolean;
  readOnly?: boolean;
}) {
  const update = (patch: Partial<PaymentDraft>) =>
    onChange({ ...draft, ...patch });
  let total = "Check line amounts";
  try {
    total = formatNearAmount(totalAtomic(draft)) + " NEAR";
  } catch {}
  return (
    <section
      className="rounded-2xl border border-line bg-white p-5 sm:p-7"
      aria-labelledby="draft-heading"
    >
      <h2 id="draft-heading" className="font-serif text-2xl">
        Prepare invoice payment
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Local draft for native NEAR on testnet. Account existence and treasury
        policy are checked when connected, before submission.
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <fieldset disabled={readOnly}>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["Invoice reference", "reference", 100],
                ["Treasury account", "treasuryId", 64],
                ["Recipient account", "recipient", 64],
                ["Purpose", "purpose", 500],
              ] as const
            ).map(([label, key, max]) => (
              <label key={key} className="min-w-0 text-sm">
                {label}
                <input
                  className={field}
                  required
                  maxLength={max}
                  value={draft[key]}
                  onChange={(e) => update({ [key]: e.target.value })}
                  autoComplete="off"
                  autoCapitalize={
                    key === "treasuryId" || key === "recipient"
                      ? "none"
                      : undefined
                  }
                />
              </label>
            ))}
            <label className="text-sm">
              Due date
              <input
                className={field}
                type="date"
                required
                value={draft.dueDate}
                onChange={(e) => update({ dueDate: e.target.value })}
              />
            </label>
          </div>
          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold">
              Invoice lines
            </legend>
            {draft.lines.map((line, i) => (
              <div
                key={i}
                className="grid min-w-0 gap-3 rounded-xl border border-line p-3 sm:grid-cols-[2fr_1fr_2fr]"
              >
                <label className="min-w-0 text-sm">
                  Description {i + 1}
                  <input
                    className={field}
                    required
                    maxLength={120}
                    value={line.description}
                    onChange={(e) =>
                      update({
                        lines: draft.lines.map((l, n) =>
                          n === i ? { ...l, description: e.target.value } : l,
                        ),
                      })
                    }
                  />
                </label>
                <label className="min-w-0 text-sm">
                  Quantity {i + 1}
                  <input
                    className={field}
                    type="number"
                    min={1}
                    max={1000000}
                    step={1}
                    required
                    value={line.quantity}
                    onChange={(e) =>
                      update({
                        lines: draft.lines.map((l, n) =>
                          n === i
                            ? { ...l, quantity: Number(e.target.value) }
                            : l,
                        ),
                      })
                    }
                  />
                </label>
                <label className="min-w-0 text-sm">
                  Unit amount in NEAR {i + 1}
                  <input
                    className={field}
                    inputMode="decimal"
                    required
                    maxLength={64}
                    value={line.unitAmount}
                    onChange={(e) =>
                      update({
                        lines: draft.lines.map((l, n) =>
                          n === i ? { ...l, unitAmount: e.target.value } : l,
                        ),
                      })
                    }
                  />
                </label>
                {draft.lines.length > 1 && (
                  <Button
                    variant="quiet"
                    onClick={() =>
                      update({ lines: draft.lines.filter((_, n) => n !== i) })
                    }
                  >
                    Remove line {i + 1}
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={draft.lines.length >= 20}
              onClick={() =>
                update({
                  lines: [
                    ...draft.lines,
                    { description: "", quantity: 1, unitAmount: "" },
                  ],
                })
              }
            >
              Add invoice line
            </Button>
          </fieldset>
          <p className="break-all font-mono text-sm">Total: {total}</p>
        </fieldset>
        {readOnly && (
          <p className="text-sm">
            This draft already has a proposal reference. Refresh its
            authoritative outcome; use New draft for a different payment.
          </p>
        )}
        <p className="text-xs leading-5 text-muted">
          Saving keeps invoice details in this browser until deleted or browser
          data is cleared. No keys or object photos are stored with a draft.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={disabled || readOnly}>
            Save local draft
          </Button>
          <Button variant="secondary" disabled={disabled} onClick={onReview}>
            Review exact payment
          </Button>
        </div>
      </form>
    </section>
  );
}
