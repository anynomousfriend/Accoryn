import { createRoot } from "react-dom/client";
import { CapturePanel } from "../../src/object-registration/CapturePanel.tsx";
import "../../src/styles.css";
// Layout-only component input: no media stream, inference or enrollment is fabricated.
createRoot(document.getElementById("root")!).render(
  <CapturePanel
    state={{
      phase: "capture",
      storageReady: true,
      mode: "enrollment",
      detail: "",
      viewIndex: 0,
      previews: [],
      reviewUrl: null,
      template: null,
      comparison: null,
      progress: null,
    }}
    attachVideo={() => {}}
    onCapture={() => {}}
    onRetake={() => {}}
    onAccept={() => {}}
  />,
);
