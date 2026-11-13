import type { PaymentDraft } from "../workspace/drafts.ts";
import type { PendingAction } from "../workspace/action-journal.ts";
import type { ReceiptExportRow } from "../payments/receipt-csv.ts";
export type Account = { network: "testnet"; accountId: string };
export type Treasury = {
  network: "testnet";
  id: string;
  members: { accountId: string; role: string }[];
  requiredApprovals: number;
  policyVersion: string;
  balanceAtomic: string;
};
export type Proposal = {
  network: "testnet";
  asset: "native";
  id: string;
  contentHash: string;
  treasuryId: string;
  recipient: string;
  amountAtomic: string;
  purpose: string;
  status: "pending" | "unknown" | "failed" | "settled" | "rejected";
  approvals: string[];
  requiredApprovals: number;
  expiresAt: string;
};
export type AcousticEvidence = {
  proposalId: string;
  contentHash: string;
  expiresAt: string;
  participantIds: string[];
};
/** Client-facing v1 adapter contract, not a custody/proof protocol. Engines must
 * independently authorize every call. UI state, draft IDs and decoded sound are
 * never spending authority. Mutations must be idempotent by requestId; reconciliation
 * must use that same identifier and confirm actual execution/rejection. All amounts below are native NEAR atomic strings. */
export type ServiceMethods = {
  openAccount: (requestId: string, signal: AbortSignal) => Promise<Account>;
  recoverAccount: (requestId: string, signal: AbortSignal) => Promise<Account>;
  readTreasury: (id: string, signal: AbortSignal) => Promise<Treasury>;
  createTreasury: (
    input: {
      name: string;
      memberAccountIds: string[];
      requiredApprovals: number;
      requestId: string;
    },
    signal: AbortSignal,
  ) => Promise<Treasury>;
  joinTreasury: (
    id: string,
    requestId: string,
    signal: AbortSignal,
  ) => Promise<{ status: "requested" | "member" }>;
  proposePayment: (
    draft: PaymentDraft,
    requestId: string,
    signal: AbortSignal,
  ) => Promise<Proposal>;
  startAcousticSession: (
    proposal: Proposal,
    onProgress: (message: string) => void,
    signal: AbortSignal,
  ) => Promise<AcousticEvidence>;
  approveProposal: (
    proposal: Proposal,
    evidence: AcousticEvidence,
    requestId: string,
    signal: AbortSignal,
  ) => Promise<Proposal>;
  executeProposal: (
    proposal: Proposal,
    requestId: string,
    signal: AbortSignal,
  ) => Promise<Proposal>;
  readProposal: (
    treasuryId: string,
    proposalId: string,
    signal: AbortSignal,
  ) => Promise<Proposal>;
  listReceipts: (
    treasuryId: string,
    signal: AbortSignal,
  ) => Promise<ReceiptExportRow[]>;
  reconcileAction: (
    action: PendingAction,
    signal: AbortSignal,
  ) => Promise<{
    requestId: string;
    status: "pending" | "unknown" | "confirmed" | "rejected";
    proposal?: Proposal;
    account?: Account;
    treasury?: Treasury;
  }>;
};
export type ServiceName = keyof ServiceMethods;
export type AppServices = {
  version: 1;
  capabilities: readonly ServiceName[];
  releaseResources?: () => void;
} & Partial<ServiceMethods>;
export function hasService<K extends ServiceName>(
  services: AppServices,
  name: K,
): boolean {
  return (
    services.version === 1 &&
    services.capabilities.includes(name) &&
    typeof services[name] === "function"
  );
}
export function requireService<K extends ServiceName>(
  services: AppServices,
  name: K,
): ServiceMethods[K] {
  if (!hasService(services, name))
    throw new Error("This service is not connected yet.");
  return services[name] as ServiceMethods[K];
}
