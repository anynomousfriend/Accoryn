import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Emit real entry files so direct links do not depend on a host SPA rewrite. */
export async function writeRoutePages(distDirectory) {
  const html = await readFile(join(distDirectory, "index.html"), "utf8");
  await Promise.all(
    ["device-check", "design"].map(async (route) => {
      const directory = join(distDirectory, route);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "index.html"), html);
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await writeRoutePages(resolve(process.argv[2] ?? "dist"));
}
