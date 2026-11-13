import { createRoot } from "react-dom/client";
import { ProposalReview } from "../../src/workspace/ProposalReview.tsx";
import "../../src/styles.css";
// Component rendering contract only; not a connected or fabricated engine.
createRoot(document.getElementById("root")!).render(
  <ProposalReview
    proposal={{
      network: "testnet",
      asset: "native",
      id: "canonical-proposal",
      contentHash: "hash-canonical",
      treasuryId: "canonical-team.testnet",
      recipient: "supplier.testnet",
      amountAtomic: "1000000000000000000000001",
      purpose: "Canonical engine payment purpose",
      status: "pending",
      approvals: [],
      requiredApprovals: 2,
      expiresAt: "2026-11-20T00:00:00.000Z",
    }}
  />,
);
