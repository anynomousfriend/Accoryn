import { TemplateStore } from "../../src/object-registration/template-store.ts";
import { ObjectRegistrationController } from "../../src/object-registration/controller.ts";
import { InferenceClient } from "../../src/object-registration/inference-client.ts";
const store = new TemplateStore();
const controller = new ObjectRegistrationController();
let inference: InferenceClient | null = null;
Object.assign(window, {
  registrationHarness: {
    store,
    controller,
    makeTemplate: async (label: string) => {
      inference ??= new InferenceClient();
      const ac = new AbortController();
      const model = await inference.load(() => {}, ac.signal);
      const views = [];
      for (let i = 0; i < 3; i++) {
        const image = await createImageBitmap(
          await (await fetch(`/tests/fixtures/vision/cup-a-${i}.jpg`)).blob(),
        );
        views.push((await inference.embed(image, ac.signal)).vector);
      }
      return {
        schemaVersion: 1,
        id: crypto.randomUUID(),
        label,
        createdAt: new Date().toISOString(),
        model,
        views,
      };
    },
    corrupt: async () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("accoryn-object-research-v1");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("templates", "readwrite");
          tx.objectStore("templates").put({ schemaVersion: 999 }, "active");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    dispose: () => {
      controller.dispose();
      inference?.dispose();
    },
  },
});
window.addEventListener("pagehide", () => {
  controller.dispose();
  inference?.dispose();
});
