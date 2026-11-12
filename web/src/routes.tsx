import type { ReactNode } from "react";
import App from "./App.tsx";
import ExperienceReference from "./design/ExperienceReference.tsx";

export function renderRoute(pathname: string): ReactNode {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/design" ? <ExperienceReference /> : <App />;
}
