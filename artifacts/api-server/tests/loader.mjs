// ESM loader hook that mirrors esbuild's extension-less import resolution so
// that `node --test` can run the TypeScript sources directly. The production
// build is bundled by esbuild (which handles `./routes` → `./routes/index.ts`
// automatically), so the source files themselves omit extensions; the bare
// Node ESM resolver doesn't support that, so we patch it here.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const TS_EXTS = [".ts", ".mts", ".tsx"];

export function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !path.extname(specifier) &&
    context.parentURL
  ) {
    const parentPath = fileURLToPath(context.parentURL);
    const baseDir = path.dirname(parentPath);
    const target = path.resolve(baseDir, specifier);

    for (const ext of TS_EXTS) {
      if (existsSync(target + ext)) {
        return nextResolve(pathToFileURL(target + ext).href, context);
      }
    }
    if (existsSync(target) && statSync(target).isDirectory()) {
      for (const ext of TS_EXTS) {
        const idx = path.join(target, "index" + ext);
        if (existsSync(idx)) {
          return nextResolve(pathToFileURL(idx).href, context);
        }
      }
    }
  }
  return nextResolve(specifier, context);
}
