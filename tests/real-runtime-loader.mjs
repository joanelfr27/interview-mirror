import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const root = dirname(fileURLToPath(import.meta.url));
    const base = join(root, "..", "src", specifier.slice(2));
    const candidates = extname(base) ? [base] : [base + ".ts", base + ".tsx", join(base, "index.ts")];
    const target = candidates.find(existsSync);
    if (!target) throw new Error("real runtime loader could not resolve alias: " + specifier);
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}
