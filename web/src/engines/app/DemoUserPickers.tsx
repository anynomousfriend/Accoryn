import { Button } from "../../design/primitives.tsx";
import type { DemoDirectoryState } from "./useDemoUsers.ts";
const field =
  "mt-2 min-h-12 w-full rounded-lg border border-line bg-white p-3 text-base";
function DirectoryFeedback({ directory }: { directory: DemoDirectoryState }) {
  return (
    <div className="my-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted">Demo users · public testnet IDs only</p>
        <Button
          variant="quiet"
          disabled={directory.loading}
          onClick={directory.refresh}
        >
          Refresh demo users
        </Button>
      </div>
      <p aria-live="polite" className="text-xs leading-5 text-muted">
        {directory.error
          ? "Shared demo list unavailable. Keep your selection, refresh, or enter an account manually. Static builds need manual entry."
          : directory.loading
            ? "Loading demo users…"
            : directory.accounts.length
              ? "Accounts created or selected on either device appear here. This list grants no signing access."
              : "No shared users yet. Create or select an account on the other device, then refresh."}
      </p>
    </div>
  );
}
export function MemberUserPicker({
  directory,
  value,
  onChange,
  creator = "",
  known = [],
  manualLabel = "Member usernames (full testnet account IDs, one per line)",
  disabled = false,
}: {
  directory: DemoDirectoryState;
  value: string;
  onChange: (value: string) => void;
  creator?: string;
  known?: string[];
  manualLabel?: string;
  disabled?: boolean;
}) {
  const selected = value.trim().split(/\s+/).filter(Boolean);
  const candidates = [
    ...new Set([...directory.accounts, ...known, ...selected]),
  ]
    .filter((id) => id !== creator)
    .sort();
  return (
    <div>
      <DirectoryFeedback directory={directory} />
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">
          Select vault members
        </legend>
        {creator && (
          <p className="break-all rounded-lg bg-sky p-3 text-sm">
            {creator} · you, included automatically
          </p>
        )}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {candidates.map((id) => (
            <label
              key={id}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-line p-3 text-sm"
            >
              <input
                className="size-5 shrink-0"
                type="checkbox"
                aria-label={`Add ${id}`}
                checked={selected.includes(id)}
                onChange={(e) =>
                  onChange(
                    (e.target.checked
                      ? [...new Set([...selected, id])]
                      : selected.filter((item) => item !== id)
                    ).join("\n"),
                  )
                }
              />
              <span className="min-w-0 break-all">{id}</span>
            </label>
          ))}
        </div>
        <details>
          <summary className="min-h-12 cursor-pointer py-3 text-sm underline">
            Enter member IDs manually
          </summary>
          <label className="block text-sm">
            {manualLabel}
            <textarea
              className={field}
              rows={3}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              autoCapitalize="none"
              placeholder="partner.testnet"
            />
          </label>
        </details>
      </fieldset>
    </div>
  );
}
export function RecipientUserPicker({
  directory,
  value,
  onChange,
  disabled = false,
  manual = true,
}: {
  directory: DemoDirectoryState;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  manual?: boolean;
}) {
  const candidates = [
    ...new Set([...directory.accounts, ...(value ? [value] : [])]),
  ].sort();
  return (
    <div>
      <DirectoryFeedback directory={directory} />
      <label className="block text-sm">
        Choose recipient
        <select
          aria-label="Choose recipient"
          className={field}
          required
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select a demo user</option>
          {candidates.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      {manual && (
        <details>
          <summary className="min-h-12 cursor-pointer py-3 text-sm underline">
            Enter recipient ID manually
          </summary>
          <label className="block text-sm">
            Recipient account
            <input
              className={field}
              disabled={disabled}
              value={value}
              maxLength={64}
              autoCapitalize="none"
              autoComplete="off"
              placeholder="partner.testnet"
              onChange={(e) => onChange(e.target.value)}
            />
          </label>
        </details>
      )}
    </div>
  );
}
