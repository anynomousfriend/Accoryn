import type { Proposal } from "../integration/services.ts";
import { formatNearAmount } from "./drafts.ts";
export function ProposalReview({ proposal }: { proposal: Proposal }) {
  const fields = [
    ["Proposal", proposal.id],
    ["Content hash", proposal.contentHash],
    ["Treasury", proposal.treasuryId],
    ["Network", proposal.network],
    ["Asset", "Native NEAR"],
    ["Recipient", proposal.recipient],
    ["Amount", formatNearAmount(proposal.amountAtomic) + " NEAR"],
    ["Atomic amount", proposal.amountAtomic],
    ["Purpose", proposal.purpose],
    ["Status", proposal.status],
    ["Reported approvals", proposal.approvals.join(", ") || "None"],
    ["Required approvals", String(proposal.requiredApprovals)],
    ["Expiry", proposal.expiresAt],
  ];
  return (
    <section aria-label="Canonical payment review" className="mt-5">
      <h3 className="font-semibold">Payment to approve</h3>
      <dl className="mt-3 space-y-2 text-sm">
        {fields.map(([name, value]) => (
          <div key={name}>
            <dt className="text-muted">{name}</dt>
            <dd className="break-all font-mono">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
