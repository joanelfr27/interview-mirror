import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Privileged runtime loader.
 *
 * Unlike the test loaders, this loader does not stub OpenAI, Supabase, or any
 * other runtime dependency. It only resolves the repository's "@/..." alias
 * to the real source tree so the privileged workflow executes the production
 * dependency graph with its supplied secrets.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const root = dirname(fileURLToPath(import.meta.url));
    const base = join(root, "..", "src", specifier.slice(2));
    const candidates = extname(base)
      ? [base]
      : [base + ".ts", base + ".tsx", join(base, "index.ts")];

    const target = candidates.find(existsSync);

    if (!target) {
      throw new Error(
        "Privileged runtime loader could not resolve alias: " + specifier,
      );
    }

    return nextResolve(pathToFileURL(target).href, context);
  }

  return nextResolve(specifier, context);
}
