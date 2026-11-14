import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  PropsWithChildren,
} from "react";
import { Check, Circle, CircleAlert, Clock3, Radio } from "lucide-react";

type Variant = "primary" | "secondary" | "quiet";
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`ui-button ui-button-${variant} ${className}`}
      {...props}
    />
  );
}
export function ActionLink({
  variant = "primary",
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return (
    <a className={`ui-button ui-button-${variant} ${className}`} {...props} />
  );
}
export type StatusKind =
  "neutral" | "active" | "success" | "warning" | "danger";
const statusIcons = {
  neutral: Circle,
  active: Radio,
  success: Check,
  warning: Clock3,
  danger: CircleAlert,
};
export function StatusBadge({
  kind,
  children,
}: PropsWithChildren<{ kind: StatusKind }>) {
  const Icon = statusIcons[kind];
  return (
    <span className={`ui-status ui-status-${kind}`} data-contrast>
      <Icon aria-hidden="true" size={14} strokeWidth={1.8} />
      {children}
    </span>
  );
}
export function BrandLink() {
  return (
    <a href="/" className="brand-link">
      <svg viewBox="0 0 32 32" className="size-9 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="currentColor" />
        <g fill="none" stroke="white" strokeWidth="1.8">
          <rect
            x="8"
            y="8"
            width="12"
            height="16"
            rx="4"
            transform="rotate(-20 14 16)"
          />
          <rect
            x="14"
            y="10"
            width="10"
            height="13"
            rx="3"
            transform="rotate(20 19 16)"
          />
        </g>
      </svg>
      <span className="font-semibold tracking-tight text-ink">
        Team Treasury
      </span>
    </a>
  );
}
export function SiteHeader({ section }: { section?: string }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <nav
          aria-label="Main navigation"
          className="page-shell flex min-h-22 flex-wrap items-center justify-between gap-x-5 gap-y-1 py-3"
        >
          <BrandLink />
          <div className="flex items-center gap-1 sm:gap-5">
            <a className="nav-link hidden md:inline-flex" href="/landing/#how-it-works">
              How it works
            </a>
            <ActionLink href="/treasury/" variant="secondary">
              Open workspace<span aria-hidden="true">↗</span>
            </ActionLink>
          </div>
        </nav>
        {section && (
          <div className="page-shell pb-5 text-xs text-muted">{section}</div>
        )}
      </header>
    </>
  );
}
