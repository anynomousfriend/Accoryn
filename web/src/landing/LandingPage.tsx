import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Pause, Play } from "lucide-react";
import { ActionLink, BrandLink } from "../design/primitives.tsx";
import { WorkflowPreview } from "../design/WorkflowPreview.tsx";
import { TreasuryArtwork } from "./TreasuryArtwork.tsx";

const chapters = [
  {
    id: "account",
    name: "01 Assemble your team",
    title: "A shared vault. Your own say.",
    text: "Create your account, open a vault and bring your partners in. Each person keeps their own signing key and enrolls their personal object on their device.",
  },
  {
    id: "payment",
    name: "02 Prepare a payment",
    title: "Know what you’re agreeing to.",
    text: "Choose the recipient, enter the amount and explain the payment. Review the same exact details before submitting the request. Preparing a proposal does not move funds.",
  },
  {
    id: "approval",
    name: "03 Verify & approve",
    title: "Come together. Decide independently.",
    text: "Review a fresh object comparison, exchange an acoustic challenge using your devices, and sign your own approval. Execute when the required approvals are complete; share the confirmed receipt.",
  },
] as const;

export default function LandingPage() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    const hero = root.current?.querySelector(".nocturne-hero");
    const observer = new IntersectionObserver((entries) => {
      if (root.current)
        root.current.dataset.heroVisible = String(entries[0].isIntersecting);
    });
    if (hero) observer.observe(hero);
    const chaptersObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (entry)
          setActive(Number((entry.target as HTMLElement).dataset.chapter));
      },
      { rootMargin: "-20% 0px -35% 0px", threshold: [0, 0.3, 0.6] },
    );
    root.current
      ?.querySelectorAll("[data-chapter]")
      .forEach((e) => chaptersObserver.observe(e));
    return () => {
      observer.disconnect();
      chaptersObserver.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <div
      ref={root}
      className="nocturne-landing"
      data-paused={paused || !visible}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="nocturne-header page-shell">
        <BrandLink />
        <a href="#how-it-works" className="nav-link hidden sm:inline-flex">
          The way it works
        </a>
        <ActionLink href="/treasury/" variant="secondary">
          Open treasury <ArrowUpRight size={15} />
        </ActionLink>
      </header>
      <main id="main">
        <section className="nocturne-hero">
          <TreasuryArtwork />
          <div className="hero-copy">
            <p className="eyebrow-label">A shared treasury / Built on NEAR</p>
            <h1>
              Shared funds.
              <br />
              <em>Considered together.</em>
            </h1>
            <p className="hero-description">
              For teams who want every payment
              <br className="hidden sm:block" /> to be a shared decision.
            </p>
            <ActionLink href="/treasury/">
              Open treasury <ArrowUpRight size={17} />
            </ActionLink>
            <span className="hero-caption">
              NEAR testnet · native NEAR · research prototype
            </span>
          </div>
          <div className="hero-bottom page-shell">
            <a href="#how-it-works" className="nav-link">
              Explore the flow <ArrowDown size={15} />
            </a>
            <button
              className="motion-control"
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}{" "}
              {paused ? "Resume motion" : "Pause motion"}
            </button>
          </div>
        </section>
        <section className="editorial-intro page-shell" id="how-it-works">
          <div className="intro-facts">
            <div>
              <span className="eyebrow-label">The idea</span>
              <p>
                Shared money.
                <br />
                Individual consent.
              </p>
            </div>
            <div>
              <span className="eyebrow-label">The essentials</span>
              <p>
                Your camera.
                <br />
                Your speaker. Your mic.
              </p>
            </div>
            <div>
              <span className="eyebrow-label">The network</span>
              <p>NEAR testnet</p>
            </div>
          </div>
          <h2>
            Some decisions deserve
            <br className="hidden lg:block" /> to be made together.
            <br />
            <em>
              A treasury that makes
              <br className="hidden lg:block" /> room for everyone’s say.
            </em>
          </h2>
        </section>
        <section
          className="walkthrough-section page-shell"
          aria-label="Product walkthrough"
        >
          <div className="walkthrough-heading">
            <p className="eyebrow-label">
              From your first account to the final receipt
            </p>
            <h2>
              The way
              <br />
              <em>it comes together.</em>
            </h2>
          </div>
          <div className="walkthrough-grid">
            <div className="walkthrough-sticky">
              <div
                className="chapter-controls"
                aria-label="Walkthrough chapters"
              >
                {chapters.map((c, i) => (
                  <button
                    key={c.id}
                    aria-pressed={active === i}
                    onClick={() => setActive(i)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              <WorkflowPreview chapter={chapters[active].id} />
            </div>
            <div className="walkthrough-chapters">
              {chapters.map((c, i) => (
                <article key={c.id} data-chapter={i}>
                  <span className="chapter-number">0{i + 1}</span>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                  <div className="mobile-preview">
                    <WorkflowPreview chapter={c.id} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="honest-section page-shell">
          <p className="eyebrow-label">
            Thoughtful by design. Honest about the limits.
          </p>
          <div className="honest-grid">
            <h2>
              People approve.
              <br />
              <em>The chain records.</em>
            </h2>
            <div>
              <p>
                Your vault’s rules determine the approvals required. A payment
                is complete only after its on-chain outcome is verified.
              </p>
              <details>
                <summary>About objects, sound & security</summary>
                <p>
                  Object comparisons are experimental visual checks, not
                  identity verification or cryptographic keys. Audio can be
                  relayed and cannot guarantee that devices are in the same
                  room. This testnet app stores signing keys in your browser,
                  unencrypted and without cross-device recovery. Objects are not
                  enforced by the deployed contracts.
                </p>
              </details>
              <a className="nav-link" href="/device-check/">
                Check your device <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
        </section>
        <section className="closing-section page-shell">
          <p className="eyebrow-label">Your team. Your next decision.</p>
          <h2>
            Make room
            <br />
            for <em>agreement.</em>
          </h2>
          <ActionLink href="/treasury/">
            Open treasury <ArrowUpRight size={17} />
          </ActionLink>
          <div className="closing-rings" aria-hidden="true">
            ◎
          </div>
        </section>
      </main>
      <footer className="landing-footer page-shell">
        <BrandLink />
        <span>Built on NEAR · Testnet research prototype</span>
        <a href="/treasury/" className="nav-link">
          Enter workspace ↗
        </a>
      </footer>
    </div>
  );
}
