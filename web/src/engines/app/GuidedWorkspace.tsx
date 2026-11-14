import type { ReactNode } from "react";
import { BrandLink, Button } from "../../design/primitives.tsx";
import {
  UserRound,
  Landmark,
  ArrowUpRight,
  UsersRound,
  Settings2,
  ChevronRight,
} from "lucide-react";
export const tasks = [
  { id: "account", label: "Account" },
  { id: "vault", label: "Overview" },
  { id: "object", label: "Members" },
  { id: "payment", label: "New payment" },
  { id: "approvals", label: "Approvals" },
  { id: "activity", label: "Completed & records" },
  { id: "settings", label: "Vault settings" },
] as const;
export type Task = (typeof tasks)[number]["id"];
export function taskFromHash(hash: string): Task {
  if (hash === "#overview") return "vault";
  if (hash === "#members") return "object";
  return tasks.find((t) => "#" + t.id === hash)?.id ?? "account";
}
const navigation = [
  { id: "vault", label: "Overview", icon: Landmark },
  { id: "payment", label: "Payments", icon: ArrowUpRight },
  { id: "object", label: "Members", icon: UsersRound },
  { id: "settings", label: "Vault settings", icon: Settings2 },
] as const;
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
  const payments = ["payment", "approvals", "activity"].includes(task);
  return (
    <div className="treasury-app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="treasury-topbar">
        <BrandLink />
        <div className="topbar-vault">
          <span className="eyebrow-label">Current vault</span>
          <span>{vault || "Choose your shared vault"}</span>
        </div>
        <div className="account-controls">
          <span className="network-label">
            <span />
            NEAR testnet
          </span>
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => onNavigate("account")}
            aria-current={task === "account" ? "page" : undefined}
          >
            <UserRound size={15} />
            <span className="account-label">{account || "Account"}</span>
          </Button>
          {account && (
            <Button variant="quiet" disabled={busy} onClick={onLock}>
              End session
            </Button>
          )}
        </div>
      </header>
      <div className="treasury-layout">
        <aside className="treasury-sidebar">
          <p className="eyebrow-label mb-5 hidden lg:block">Your treasury</p>
          <nav aria-label="Workspace navigation" className="task-navigation">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                aria-current={
                  task === id || (id === "payment" && payments)
                    ? "page"
                    : undefined
                }
                onClick={() => onNavigate(id)}
                className="task-link"
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <a
            href="/device-check/"
            target="_blank"
            rel="noreferrer"
            className="nav-link min-h-11 w-full justify-end text-xs lg:hidden"
          >
            Device help <ChevronRight size={14} aria-hidden="true" />
          </a>
          <div className="sidebar-context">
            <span className="sidebar-emblem" aria-hidden="true">
              ◎
            </span>
            <p className="font-serif text-2xl text-ink">
              Shared funds.
              <br />
              <em>Individual consent.</em>
            </p>
            <p className="mt-4">Every member signs their own decision.</p>
            <a
              href="/device-check/"
              target="_blank"
              rel="noreferrer"
              className="nav-link mt-5"
            >
              Device help <ChevronRight size={14} />
            </a>
          </div>
        </aside>
        <main id="main" className="treasury-content [overflow-wrap:anywhere]">
          <div className="workspace-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={12} aria-hidden="true" />
            <span>
              {payments ? "Payments" : tasks.find((t) => t.id === task)?.label}
            </span>
          </div>
          {payments && (
            <nav className="payment-navigation" aria-label="Payment views">
              {tasks
                .filter((t) =>
                  ["payment", "approvals", "activity"].includes(t.id),
                )
                .map((t) => (
                  <button
                    key={t.id}
                    disabled={busy}
                    aria-current={task === t.id ? "page" : undefined}
                    onClick={() => onNavigate(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
            </nav>
          )}
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
