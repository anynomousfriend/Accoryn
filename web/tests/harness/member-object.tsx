// Component-state fixture using real local inference and IndexedDB. This does
// not simulate a live camera and is never emitted into the built application.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import ObjectRegistrationPage from "../../src/object-registration/ObjectRegistrationPage.tsx";
import { ObjectRegistrationController } from "../../src/object-registration/controller.ts";
import { TemplateStore } from "../../src/object-registration/template-store.ts";
import { memberTemplateKey } from "../../src/engines/app/member-object.ts";
import { InferenceClient } from "../../src/object-registration/inference-client.ts";
import { compareEmbeddings } from "../../src/object-registration/comparison.ts";
import "../../src/styles.css";
const store = new TemplateStore(
  memberTemplateKey("team.sputnikv2.testnet", "alice.testnet"),
);
const controller = new ObjectRegistrationController(store);
const inference = new InferenceClient();
const signal = new AbortController().signal;
const model = await inference.load(() => {}, signal);
const scans = [];
for (const name of ["cup-a-0", "cup-a-1", "cup-a-2", "cup-a-heldout"]) {
  const bitmap = await createImageBitmap(
    await (await fetch(`/tests/fixtures/vision/${name}.jpg`)).blob(),
  );
  scans.push(await inference.embed(bitmap, signal));
}
const template = {
  schemaVersion: 1 as const,
  id: crypto.randomUUID(),
  label: "Fixture cup",
  createdAt: new Date().toISOString(),
  model,
  views: [scans[0].vector, scans[1].vector, scans[2].vector] as [
    number[],
    number[],
    number[],
  ],
};
await store.save(template, signal);
const comparison = compareEmbeddings(
  template.views,
  scans[3].vector,
  scans[3].inferenceMs,
);
function Harness() {
  const [active, setActive] = useState(false);
  return (
    <>
      <p data-testid="check-state">{active ? "active" : "inactive"}</p>
      <ObjectRegistrationPage
        registrationController={controller}
        member={{
          accountId: "alice.testnet",
          vaultId: "team.sputnikv2.testnet",
          approval: true,
          onTemplate: () => {},
          onComparisonReset: () => setActive(false),
          onAcknowledge: () => setActive(true),
        }}
      />
      <button
        onClick={() => {
          // Same snapshot transition the real controller emits after embedding a crop.
          (controller as unknown as { update: (value: object) => void }).update(
            {
              phase: "result",
              mode: "comparison",
              comparison,
              detail: "Scan compared",
            },
          );
        }}
      >
        Load actual fixture comparison
      </button>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
inference.dispose();
window.addEventListener("pagehide", () => controller.dispose());
