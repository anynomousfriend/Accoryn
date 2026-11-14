import { useState } from "react";
import { Button } from "../../design/primitives.tsx";
import { DraftEditor } from "../../workspace/DraftEditor.tsx";
import { RecipientUserPicker } from "./DemoUserPickers.tsx";
import type { DemoDirectoryState } from "./useDemoUsers.ts";
import {
  formatNearAmount,
  totalAtomic,
  type PaymentDraft,
} from "../../workspace/drafts.ts";
type Props = {
  draft: PaymentDraft;
  disabled: boolean;
  readOnly: boolean;
  directory: DemoDirectoryState;
  onChange: (draft: PaymentDraft) => void;
  onSave: () => void;
  onReview: () => void;
};
const field =
  "mt-2 min-h-12 w-full rounded-lg border border-line bg-surface p-3 text-base";
export function VaultPaymentEditor(props: Props) {
  const { draft, disabled, readOnly, onChange, onSave, onReview, directory } =
    props;
  const [itemized, setItemized] = useState(
    draft.lines.length !== 1 || draft.lines[0].quantity !== 1,
  );
  if (itemized)
    return (
      <>
        <RecipientUserPicker
          directory={directory}
          value={draft.recipient}
          onChange={(recipient) => onChange({ ...draft, recipient })}
          disabled={disabled || readOnly}
          manual={false}
        />
        <DraftEditor {...props} fixedTreasuryId={draft.treasuryId} />
        <Button
          variant="quiet"
          disabled={draft.lines.length !== 1 || draft.lines[0].quantity !== 1}
          onClick={() => setItemized(false)}
        >
          Use simple payment
        </Button>
      </>
    );
  let total = "Enter a valid amount";
  try {
    total = formatNearAmount(totalAtomic(draft)) + " NEAR";
  } catch {
    /* Incomplete draft. */
  }
  return (
    <section
      aria-labelledby="draft-heading"
      className="rounded-xl border border-line p-5 sm:p-7"
    >
      <h2 id="draft-heading" className="font-serif text-2xl">
        Prepare invoice payment
      </h2>
      <p className="mt-2 break-all text-sm text-muted">
        From {draft.treasuryId}. Native NEAR on testnet.
      </p>
      <form
        className="mt-5 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <fieldset disabled={disabled || readOnly} className="space-y-4">
          <RecipientUserPicker
            directory={directory}
            value={draft.recipient}
            onChange={(recipient) => onChange({ ...draft, recipient })}
            disabled={disabled || readOnly}
          />
          <label className="block text-sm">
            Purpose
            <input
              className={field}
              required
              maxLength={500}
              placeholder="What is this payment for?"
              value={draft.purpose}
              onChange={(e) =>
                onChange({
                  ...draft,
                  purpose: e.target.value,
                  lines: [
                    {
                      ...draft.lines[0],
                      description: e.target.value.slice(0, 120),
                    },
                  ],
                })
              }
            />
          </label>
          <label className="block text-sm">
            Amount in NEAR
            <input
              className={field}
              required
              inputMode="decimal"
              maxLength={64}
              placeholder="0.05"
              value={draft.lines[0].unitAmount}
              onChange={(e) =>
                onChange({
                  ...draft,
                  lines: [{ ...draft.lines[0], unitAmount: e.target.value }],
                })
              }
            />
          </label>
          <details>
            <summary className="min-h-12 cursor-pointer py-3 text-sm">
              Invoice reference and due date
            </summary>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Invoice reference
                <input
                  className={field}
                  required
                  maxLength={100}
                  value={draft.reference}
                  onChange={(e) =>
                    onChange({ ...draft, reference: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                Due date
                <input
                  className={field}
                  required
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) =>
                    onChange({ ...draft, dueDate: e.target.value })
                  }
                />
              </label>
            </div>
          </details>
        </fieldset>
        <p className="text-xl font-semibold tabular-nums">Total: {total}</p>
        <p className="text-xs leading-5 text-muted">
          Saving creates a local draft. Review the saved details below before
          submitting a proposal. No money moves when saving.
        </p>
        {readOnly && (
          <p className="text-sm">
            This invoice is already submitted. Open its proposal in Approvals.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={disabled || readOnly}>
            Save local draft
          </Button>
          <Button variant="secondary" disabled={disabled} onClick={onReview}>
            Review exact payment
          </Button>
          <Button
            variant="quiet"
            disabled={disabled || readOnly}
            onClick={() => setItemized(true)}
          >
            Use itemized invoice editor
          </Button>
        </div>
      </form>
    </section>
  );
}
