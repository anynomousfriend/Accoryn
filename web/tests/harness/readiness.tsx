import { createRoot } from "react-dom/client";
import { ReadinessContinuation } from "../../src/object-registration/ReadinessContinuation.tsx";
import "../../src/styles.css";
// Component contract only. This does not manufacture sensor confirmations.
createRoot(document.getElementById("root")!).render(
  <ReadinessContinuation
    confirmedCount={Number(new URLSearchParams(location.search).get("count"))}
  />,
);
