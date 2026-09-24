import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  const root = dirname(fileURLToPath(import.meta.url));

  if (specifier === "@/lib/supabase/server") {
    const stub = join(root, "supabase-test-stub.mjs");
    return nextResolve(pathToFileURL(stub).href, context);
  }

  if (specifier === "openai") {
    const stub = join(root, "openai-test-stub.mjs");
    return nextResolve(pathToFileURL(stub).href, context);
  }

  if (specifier === "next/server") {
    const nextServer = join(root, "..", "node_modules", "next", "server.js");
    return nextResolve(pathToFileURL(nextServer).href, context);
  }

  if (specifier.startsWith("@/")) {
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
