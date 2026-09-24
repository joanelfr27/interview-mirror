import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/supabase/server") {
    const stub = join(
      dirname(fileURLToPath(import.meta.url)),
      "supabase-test-stub.mjs"
    );
    return nextResolve(pathToFileURL(stub).href, context);
  }

  if (specifier === "openai") {
    const stub = join(
      dirname(fileURLToPath(import.meta.url)),
      "openai-test-stub.mjs"
    );
    return nextResolve(pathToFileURL(stub).href, context);
  }

  if (specifier.startsWith("@/")) {
    const root = dirname(fileURLToPath(import.meta.url));
    const base = join(root, "..", "src", specifier.slice(2));
    const candidates = extname(base)
      ? [base]
      : [base + ".ts", base + ".tsx", join(base, "index.ts")];

    const target = candidates.find(existsSync);

    if (!target) {
      throw new Error(
        "D14 test loader could not resolve alias: " + specifier
      );
    }

    return nextResolve(pathToFileURL(target).href, context);
  }

  return nextResolve(specifier, context);
}
