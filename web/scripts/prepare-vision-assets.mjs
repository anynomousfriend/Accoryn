import { readFile, mkdir, writeFile, rename, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(
    join(root, "src/object-registration/model-manifest.json"),
    "utf8",
  ),
);
const valid = (bytes, file) =>
  bytes.length === file.bytes &&
  createHash("sha256").update(bytes).digest("hex") === file.sha256;
for (const file of manifest.files) {
  const destination = join(
    root,
    "public/models",
    manifest.modelDirectory,
    file.path,
  );
  let existing;
  try {
    existing = await readFile(destination);
  } catch {}
  if (existing && valid(existing, file)) continue;
  console.log("Preparing pinned vision asset:", file.path);
  const response = await fetch(file.url, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok)
    throw new Error(`Model download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes, file))
    throw new Error(`Model checksum/size mismatch: ${file.path}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination + ".tmp", bytes);
  await rename(destination + ".tmp", destination);
}
const runtime = JSON.parse(
  await readFile(
    join(root, "node_modules/onnxruntime-web/package.json"),
    "utf8",
  ),
);
if (runtime.version !== manifest.runtime.version)
  throw new Error(
    "ONNX runtime changed; verify and update the manifest explicitly.",
  );
for (const file of manifest.runtime.files) {
  const source = join(root, "node_modules/onnxruntime-web/dist", file.path);
  if (!valid(await readFile(source), file))
    throw new Error("Runtime checksum mismatch: " + file.path);
  const destination = join(
    root,
    "public/runtime",
    manifest.runtime.version,
    file.path,
  );
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
console.log(
  "Vision assets verified; photos never enter this preparation step.",
);
