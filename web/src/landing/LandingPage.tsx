import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Camera,
  CheckCheck,
  UsersRound,
} from "lucide-react";
import { ActionLink, BrandLink, SiteHeader } from "../design/primitives.tsx";
import { SharedFrame } from "../design/SharedFrame.tsx";

const workflow = [
  {
    number: "01",
    title: "Your object.",
    label: "A familiar beginning",
    description:
      "Explore access with something personal. Guided captures will help check whether an object is distinctive enough.",
  },
  {
    number: "02",
    title: "One proposal.",
    label: "The same details",
    description:
      "Review the recipient, amount and approval policy together. Everyone should know exactly what they are approving.",
  },
  {
    number: "03",
    title: "Team approval.",
    label: "An explicit decision",
    description:
      "Check acoustic participation, approve independently, and follow the payment through to its verified result.",
  },
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="page-shell grid items-center gap-10 pb-14 pt-12 sm:gap-14 sm:pb-20 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:py-24">
          <div>
            <p className="mb-6 flex items-center gap-2 text-xs font-medium tracking-wide text-cobalt">
              <span className="size-1.5 rounded-full bg-cobalt" />
              Research prototype
            </p>
            <h1 className="text-[44px] leading-[1.07] font-semibold tracking-[-.045em] sm:text-[64px] lg:text-[72px] xl:text-[88px]">
              One decision.{" "}
              <span className="block font-serif font-normal tracking-[-.04em]">
                Made together.
              </span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-muted">
              A shared treasury for teams that want to review payments together.
            </p>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted">
              Exploring personal-object access and acoustic participation on
              NEAR.
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <ActionLink href="/treasury/">
                Open workspace
                <ArrowRight size={17} aria-hidden="true" />
              </ActionLink>
              <ActionLink href="#how-it-works" variant="quiet">
                How it works
                <ArrowUpRight size={16} aria-hidden="true" />
              </ActionLink>
            </div>
            <p className="mt-5 text-xs leading-5 text-muted">
              Start with your account, then create or open a shared vault.
            </p>
          </div>
          <div className="min-w-0 rounded-[28px] bg-ink p-6 sm:p-8">
            <p className="text-xs tracking-[.15em] text-white">
              INDEPENDENT PEOPLE
            </p>
            <SharedFrame />
          </div>
        </section>

        <section
          id="how-it-works"
          className="page-shell scroll-mt-8 border-t border-line py-14 sm:py-20"
          aria-labelledby="workflow-title"
        >
          <div className="mb-10 grid gap-5 md:grid-cols-2">
            <div>
              <p className="eyebrow-label">The planned workflow</p>
              <h2
                id="workflow-title"
                className="mt-4 max-w-xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
              >
                One proposal.
                <br />
                Everyone on the same page.
              </h2>
            </div>
            <p className="max-w-md self-end leading-7 text-muted">
              For teams that choose to review important spending together. We’re
              building around the decision first: who is paying, who receives
              it, and whose agreement is needed.
            </p>
          </div>
          <ol className="grid gap-8 md:grid-cols-3 md:gap-0">
            {workflow.map((item) => (
              <li
                key={item.number}
                className="min-w-0 border-t border-line pt-6 md:border-t-0 md:border-r md:pr-8 md:pl-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
              >
                <span className="font-mono text-xs text-cobalt">
                  {item.number} / {item.label.toUpperCase()}
                </span>
                <h3 className="mt-5 font-serif text-3xl">{item.title}</h3>
                <p className="mt-3 max-w-sm text-sm leading-7 text-muted">
                  {item.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="page-shell grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2 lg:gap-20">
            <figure className="m-0 rounded-[28px] bg-sky p-6">
              <img
                src="/assets/experience/object-study.svg"
                alt="Abstract personal object inside camera framing marks"
                width="440"
                height="380"
                loading="lazy"
                className="mx-auto w-full max-w-sm"
              />
              <figcaption className="flex items-center justify-between gap-4 border-t border-muted/30 pt-5 text-xs text-muted">
                <span>Something familiar. A new possibility.</span>
                <Camera size={17} aria-hidden="true" />
              </figcaption>
            </figure>
            <div>
              <p className="eyebrow-label">Personal, by design</p>
              <h2 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">
                Familiar can
                <br />
                feel simpler.
              </h2>
              <p className="mt-6 max-w-lg leading-7 text-muted">
                A keychain. An everyday keepsake. An object with a story. We’re
                researching whether a guided scan can make wallet access feel
                more familiar.
              </p>
              <p className="mt-4 max-w-lg text-sm leading-7 text-muted">
                A photograph is copyable, and some objects lack distinctive
                detail. Object-only access is an experiment; the matching, key
                custody and recovery still need to be proven.
              </p>
              <a
                href="/device-check/"
                className="nav-link mt-5 gap-2 font-medium text-cobalt"
              >
                Try the camera check
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section className="page-shell py-14 sm:py-20">
          <div className="grid overflow-hidden rounded-[28px] bg-ink lg:grid-cols-[1.1fr_1fr]">
            <div className="p-6 sm:p-10">
              <p className="font-mono text-xs tracking-[.13em] text-sky">
                A SHARED MOMENT
              </p>
              <h2 className="mt-5 font-serif text-4xl leading-tight text-white sm:text-5xl">
                Sound connects devices.
                <br />
                People make decisions.
              </h2>
              <p className="mt-6 max-w-lg leading-7 text-sky">
                A fresh acoustic challenge can connect a review session using
                the speakers and microphones already in your devices. Each
                member still chooses whether to approve.
              </p>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white">
                <span className="inline-flex min-h-11 items-center gap-2">
                  <AudioLines size={17} aria-hidden="true" />
                  Built-in sound
                </span>
                <span className="inline-flex min-h-11 items-center gap-2">
                  <UsersRound size={17} aria-hidden="true" />
                  Independent consent
                </span>
              </div>
              <p className="mt-5 max-w-lg border-t border-white/20 pt-5 text-sm leading-6 text-sky">
                No location tracking or extra hardware. Audio can be replayed or
                relayed, so it cannot guarantee that people are in the same
                room.
              </p>
            </div>
            <div className="flex flex-col justify-center border-t border-white/20 p-6 sm:p-10 lg:border-t-0 lg:border-l">
              <figure className="m-0 rounded-[20px] bg-canvas p-4 sm:p-6">
                <img
                  src="/assets/experience/signal-bridge.svg"
                  alt="Sender and listener exchanging an acoustic challenge"
                  width="440"
                  height="240"
                  loading="lazy"
                  className="w-full"
                />
                <figcaption className="border-t border-line pt-4 text-center text-xs leading-5 text-muted">
                  Planned exchange illustration.
                  <br />
                  This is not a live microphone reading.
                </figcaption>
              </figure>
              <p className="mt-5 text-center text-xs leading-5 text-sky">
                Participation and payment approval are separate steps.
              </p>
            </div>
          </div>
        </section>

        <section className="page-shell pb-14 sm:pb-20">
          <div className="flex flex-col justify-between gap-7 rounded-[28px] bg-sky p-6 sm:p-10 md:flex-row md:items-center">
            <div>
              <span className="eyebrow-label">Begin with the essentials</span>
              <h2 className="mt-3 font-serif text-3xl sm:text-4xl">
                See, hear, and be heard.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
                Check your actual device before the next feature. Access starts
                only when you choose a check.
              </p>
            </div>
            <ActionLink href="/device-check/" className="shrink-0">
              Check your device
              <CheckCheck size={17} aria-hidden="true" />
            </ActionLink>
          </div>
        </section>
      </main>
      <footer className="page-shell pb-8">
        <div className="flex flex-wrap items-center justify-between gap-5 border-t border-line pt-6">
          <BrandLink />
          <div className="flex flex-wrap items-center gap-5 text-xs text-muted">
            <span>NEAR treasury research prototype</span>
            <a href="/design/" className="nav-link">
              UI reference
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
