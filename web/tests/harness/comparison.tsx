import { createRoot } from "react-dom/client";
import { ComparisonResult } from "../../src/object-registration/ComparisonResult.tsx";
import { InferenceClient } from "../../src/object-registration/inference-client.ts";
import { compareEmbeddings } from "../../src/object-registration/comparison.ts";
import "../../src/styles.css";
const client = new InferenceClient();
const signal = new AbortController().signal;
await client.load(() => {}, signal);
const vectors = [];
for (const path of [
  "cup-a-0.jpg",
  "cup-a-1.jpg",
  "cup-a-2.jpg",
  "cup-a-heldout.jpg",
]) {
  const bitmap = await createImageBitmap(
    await (await fetch("/tests/fixtures/vision/" + path)).blob(),
  );
  vectors.push(await client.embed(bitmap, signal));
}
const result = compareEmbeddings(
  [vectors[0].vector, vectors[1].vector, vectors[2].vector],
  vectors[3].vector,
  vectors[3].inferenceMs,
);
createRoot(document.getElementById("root")!).render(
  <ComparisonResult comparison={result} />,
);
client.dispose();
