import BoardPage from "./engines/app/BoardPage.tsx";
import TreasuryPage from "./engines/app/TreasuryPage.tsx";
import WorkspacePage from "./workspace/WorkspacePage.tsx";
import AcousticCheckPage from "./acoustic-check/AcousticCheckPage.tsx";
import type { ReactNode } from "react";
import App from "./App.tsx";
import ObjectRegistrationPage from "./object-registration/ObjectRegistrationPage.tsx";
import ExperienceReference from "./design/ExperienceReference.tsx";
import LandingPage from "./landing/LandingPage.tsx";
import { ActionLink, SiteHeader } from "./design/primitives.tsx";

export function renderRoute(pathname: string): ReactNode {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/")
    return /^#(account|vault|object|payment|approvals|activity|settings|overview|members)$/.test(
      location.hash,
    ) || new URLSearchParams(location.search).has("dao") ? (
      <TreasuryPage />
    ) : (
      <LandingPage />
    );
  if (path === "/device-check") return <App />;
  if (path === "/object-registration") return <ObjectRegistrationPage />;
  if (path === "/board") return <BoardPage />;
  if (path === "/treasury") return <TreasuryPage />;
  if (path === "/workspace") return <WorkspacePage />;
  if (path === "/acoustic-check") return <AcousticCheckPage />;
  if (path === "/landing") return <LandingPage />;
  if (path === "/design") return <ExperienceReference />;
  return (
    <>
      <SiteHeader />
      <main id="main" className="page-shell py-24">
        <p className="eyebrow-label">Page not found</p>
        <h1 className="my-6 font-serif text-5xl">This page is not here.</h1>
        <ActionLink href="/">Back to home</ActionLink>
      </main>
    </>
  );
}
