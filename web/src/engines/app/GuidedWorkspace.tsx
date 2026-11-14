import type { ReactNode } from "react";
import { BrandLink, Button } from "../../design/primitives.tsx";
import {
  UserRound,
  Landmark,
  ScanLine,
  ArrowUpRight,
  Radio,
  History,
  Settings2,
  ChevronRight,
} from "lucide-react";
export const tasks = [
  {
    id: "account",
    label: "Account",
    icon: UserRound,
    hint: "Your browser account",
  },
  { id: "vault", label: "Vault", icon: Landmark, hint: "Your shared treasury" },
  {
    id: "object",
    label: "Member object",
    icon: ScanLine,
    hint: "Enroll on this device",
  },
  {
    id: "payment",
    label: "Payment",
    icon: ArrowUpRight,
    hint: "Prepare and review",
  },
  {
    id: "approvals",
    label: "Approvals",
    icon: Radio,
    hint: "Meet, scan and approve",
  },
  {
    id: "activity",
    label: "Activity",
    icon: History,
    hint: "Receipts and sharing",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings2,
    hint: "Governance and recovery",
  },
] as const;
export type Task = (typeof tasks)[number]["id"];
export function taskFromHash(hash: string): Task {
  return tasks.find((t) => "#" + t.id === hash)?.id ?? "account";
}
export function GuidedWorkspace({
  task,
  account,
  vault,
  busy,
  onNavigate,
  onLock,
  children,
}: {
  task: Task;
  account: string;
  vault: string;
  busy: boolean;
  onNavigate: (task: Task) => void;
  onLock: () => void;
  children: ReactNode;
}) {
  return (
    <div className="treasury-app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="treasury-topbar">
        <BrandLink />
        <div className="flex min-w-0 items-center gap-3">
          <span className="network-label">
            <span />
            NEAR testnet
          </span>
          {account && (
            <Button variant="quiet" disabled={busy} onClick={onLock}>
              End session
            </Button>
          )}
        </div>
      </header>
      <div className="treasury-layout">
        <aside className="treasury-sidebar">
          <p className="eyebrow-label mb-4 hidden lg:block">Your workspace</p>
          <nav aria-label="Workspace tasks" className="task-navigation">
            {tasks.map(({ id, label, hint, icon: Icon }, i) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                disabled={busy}
                aria-current={task === id ? "step" : undefined}
                onClick={() => onNavigate(id)}
                className="task-link"
              >
                <Icon size={19} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-semibold">{label}</span>
                  <span className="task-hint">{hint}</span>
                </span>
                <span className="task-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </button>
            ))}
          </nav>
          <a
            href="/device-check/"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-12 items-center text-xs underline lg:hidden"
          >
            Camera or sound help ↗
          </a>
          <div className="sidebar-context">
            <p className="eyebrow-label">Current signer</p>
            <p>{account || "No account selected"}</p>
            <p className="eyebrow-label mt-5">Current vault</p>
            <p>{vault || "No vault opened"}</p>
            <a
              href="/device-check/"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-12 items-center gap-2 text-sm underline"
            >
              Device help <ChevronRight size={14} />
            </a>
          </div>
        </aside>
        <main id="main" className="treasury-content [overflow-wrap:anywhere]">
          <div className="workspace-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{tasks.find((t) => t.id === task)?.label}</span>
          </div>
          {children}
          <footer className="workspace-footer">
            Testnet research prototype · native NEAR only.
            <details>
              <summary>Security and device limits</summary>
              <p>
                Object comparisons are uncalibrated research checks, not
                authentication. Browser signing keys are unencrypted and
                extractable. Clearing browser data loses local keys and object
                templates. Audio can be relayed and does not prove a secure
                same-room boundary. Objects are not enforced by the deployed
                contracts.
              </p>
            </details>
          </footer>
        </main>
      </div>
    </div>
  );
}
