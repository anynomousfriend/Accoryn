import { createRoot } from "react-dom/client";
import { renderRoute } from "./routes.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  renderRoute(window.location.pathname),
);
