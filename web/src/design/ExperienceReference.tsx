import { useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { ActionLink, SiteHeader, StatusBadge } from "./primitives.tsx";
import type { StatusKind } from "./primitives.tsx";
import { SharedFrame } from "./SharedFrame.tsx";
import tokens from "./tokens.json";

export type PaymentStudyState =
  | "review"
  | "participation"
  | "approval-recorded"
  | "submitted"
  | "confirmed"
  | "rejected"
  | "expired"
  | "unknown";
const states: Record<
  PaymentStudyState,
  { label: string; kind: StatusKind; detail: string }
> = {
  review: {
    label: "Review proposal",
    kind: "neutral",
    detail:
      "The team compares the amount, recipient, asset and approval policy.",
  },
  participation: {
    label: "Participation check",
    kind: "active",
    detail:
      "A fresh acoustic exchange would check participation. No microphone is used in this design reference.",
  },
  "approval-recorded": {
    label: "Your approval recorded",
    kind: "active",
    detail:
      "One approval does not mean the payment has been sent. The treasury policy determines what happens next.",
  },
  submitted: {
    label: "Submitted to NEAR",
    kind: "active",
    detail:
      "Submission is pending verification. A transaction hash alone is not a confirmed payment.",
  },
  confirmed: {
    label: "Payment confirmed",
    kind: "success",
    detail:
      "A live product may show this only after verifying the expected successful on-chain result.",
  },
  rejected: {
    label: "Proposal rejected",
    kind: "danger",
    detail:
      "A rejected proposal must not be presented as a successful transfer.",
  },
  expired: {
    label: "Session expired",
    kind: "warning",
    detail:
      "An expired session needs a new challenge and explicit consent, not a silently extended approval.",
  },
  unknown: {
    label: "Checking transaction status",
    kind: "warning",
    detail:
      "After a lost connection, reconcile the original transaction before offering another payment.",
  },
};

export default function ExperienceReference() {
  const [selected, setSelected] = useState<PaymentStudyState>("review");
  const long = new URLSearchParams(location.search).get("content") === "long";
  const state = states[selected];
  const fields = [
    ["Amount", "[Amount]"],
    ["Asset", "[Asset]"],
    ["Recipient", long ? "a".repeat(64) : "[Recipient account]"],
    ["Network", "[Network]"],
    [
      "Approval policy",
      long
        ? "All members of the independent community finance and contractor review committee must explicitly approve this proposal"
        : "[Required approvals / members]",
    ],
  ];
  return (
    <>
      <SiteHeader section="Design system / editable reference" />
      <main id="main" className="page-shell py-10 sm:py-16">
        <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow-label">The shared foundation</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Experience reference
            </h1>
            <p className="mt-5 max-w-xl leading-7 text-muted" data-contrast>
              One visual language for clear decisions. Inspect the components
              and motion used across mobile and laptop screens.
            </p>
          </div>
          <ActionLink
            variant="secondary"
            href={long ? "/design/" : "/design/?content=long"}
          >
            {long ? "Standard content" : "Long content"}
            <ArrowRight size={16} aria-hidden="true" />
          </ActionLink>
        </div>

        <section aria-labelledby="palette-title" className="mb-16">
          <div className="section-heading">
            <span className="eyebrow-label">01 / Foundations</span>
            <h2 id="palette-title">Color with a purpose.</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {Object.entries(tokens.colors)
              .filter(([name]) =>
                [
                  "ink",
                  "cobalt",
                  "sky",
                  "coral",
                  "canvas",
                  "success",
                  "warning",
                  "danger",
                ].includes(name),
              )
              .map(([name, value]) => (
                <div
                  key={name}
                  className="overflow-hidden rounded-xl border border-line bg-surface"
                >
                  <div className="h-20" style={{ backgroundColor: value }} />
                  <div className="p-3">
                    <span className="block text-sm font-medium capitalize">
                      {name}
                    </span>
                    <span className="mt-1 block font-mono text-xs text-muted">
                      {value}
                    </span>
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <StatusBadge kind="neutral">Not checked</StatusBadge>
            <StatusBadge kind="active">In progress</StatusBadge>
            <StatusBadge kind="success">Confirmed</StatusBadge>
            <StatusBadge kind="warning">Needs attention</StatusBadge>
            <StatusBadge kind="danger">Rejected</StatusBadge>
          </div>
        </section>

        <section
          aria-labelledby="type-title"
          className="mb-16 grid gap-8 border-y border-line py-10 md:grid-cols-2"
        >
          <div>
            <span className="eyebrow-label">02 / Typography</span>
            <h2
              id="type-title"
              className="mt-4 font-serif text-5xl leading-tight"
            >
              Room to think.
              <br />
              Clarity to act.
            </h2>
          </div>
          <div className="flex flex-col justify-center gap-4">
            <p className="text-2xl font-semibold tracking-tight">
              A clear view of the decision.
            </p>
            <p className="max-w-md leading-7 text-muted" data-contrast>
              Inter carries actions, amounts and reading text. Newsreader adds
              warmth to editorial moments. Account identifiers remain selectable
              and can wrap.
            </p>
            <div className="flex flex-wrap gap-3">
              <ActionLink href="/device-check/" data-contrast>
                Check your device
                <ArrowRight size={16} aria-hidden="true" />
              </ActionLink>
              <ActionLink href="/" variant="secondary" data-contrast>
                Back to home
              </ActionLink>
            </div>
          </div>
        </section>

        <section aria-labelledby="study-title" className="mb-16">
          <div className="section-heading">
            <span className="eyebrow-label">03 / States</span>
            <h2 id="study-title">Still details. Precise status.</h2>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.15fr]">
            <div className="max-w-md">
              <p className="mb-5 inline-flex items-center gap-2 rounded-lg bg-coral-tint px-3 py-2 text-sm font-medium">
                <Info size={16} aria-hidden="true" />
                Design reference — no transaction
              </p>
              <p className="mb-6 leading-7 text-muted">
                These are interface specimens. Choosing a state does not create
                a proposal, record an approval or move funds.
              </p>
              <label
                htmlFor="inspect-state"
                className="mb-2 block text-sm font-medium"
              >
                Inspect state
              </label>
              <select
                id="inspect-state"
                value={selected}
                onChange={(event) =>
                  setSelected(event.target.value as PaymentStudyState)
                }
                className="field-control w-full"
              >
                {Object.entries(states).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="mt-4 text-sm leading-6 text-muted">
                The treasury's actual policy determines whether the final vote
                executes immediately or needs another action.
              </p>
            </div>
            <article className="rounded-[20px] border border-line bg-surface p-5 sm:p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <span className="eyebrow-label">Proposal specimen</span>
                <span className="text-xs text-muted">No live data</span>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-6">
                {fields.map(([name, value]) => (
                  <div
                    key={name}
                    role="group"
                    aria-label={name}
                    className={
                      name === "Recipient" || name === "Approval policy"
                        ? "col-span-2 min-w-0"
                        : "min-w-0"
                    }
                  >
                    <span className="mb-2 block text-xs text-muted">
                      {name}
                    </span>
                    <span
                      className={`block wrap-anywhere ${name === "Amount" ? "text-3xl font-semibold tabular-nums" : "text-sm font-medium leading-6"}`}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-7 min-h-40 border-t border-line pt-5">
                <div role="status" aria-live="polite">
                  <StatusBadge kind={state.kind}>{state.label}</StatusBadge>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {state.detail}
                </p>
              </div>
            </article>
          </div>
        </section>

        <section
          aria-labelledby="motion-title"
          className="grid gap-8 lg:grid-cols-2"
        >
          <div>
            <span className="eyebrow-label">04 / Motion &amp; materials</span>
            <h2 id="motion-title" className="mt-4 font-serif text-4xl">
              A shared center.
            </h2>
            <p className="mt-5 max-w-md leading-7 text-muted">
              Two independent frames meet around the same point. Motion explains
              that relationship once; it never implies a payment succeeded.
            </p>
            <dl className="mt-7 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-5">
              {[
                ["120ms", "Press"],
                ["160ms", "Status fade"],
                ["560ms", "Explanation"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-2 font-mono text-sm">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm leading-6 text-muted">
              Reduced motion shows the complete scene. Keyboard state changes
              are immediate. Replay can be interrupted.
            </p>
          </div>
          <div className="rounded-[28px] bg-ink p-6 sm:p-8">
            <p className="text-xs tracking-[.15em] text-white">
              INDEPENDENT PEOPLE
            </p>
            <SharedFrame interactive />
          </div>
        </section>
        <footer className="mt-16 flex flex-wrap justify-between gap-3 border-t border-line pt-6 text-xs text-muted">
          <span>Built for a shared moment of approval.</span>
          <a className="nav-link" href="/assets/experience/manifest.json">
            Original asset manifest ↗
          </a>
        </footer>
      </main>
    </>
  );
}
