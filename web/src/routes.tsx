import WorkspacePage from "./workspace/WorkspacePage.tsx";
import type { ReactNode } from "react";
import App from "./App.tsx";
import ObjectRegistrationPage from "./object-registration/ObjectRegistrationPage.tsx";
import ExperienceReference from "./design/ExperienceReference.tsx";
import LandingPage from "./landing/LandingPage.tsx";
import { ActionLink, SiteHeader } from "./design/primitives.tsx";

export function renderRoute(pathname: string): ReactNode {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/device-check") return <App />;
  if (path === "/object-registration") return <ObjectRegistrationPage />;
  if (path === "/workspace") return <WorkspacePage />;
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
