import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const EXTS = [".ts", ".tsx", "/index.ts"];

function withExtension(path) {
  if (existsSync(path) && !path.endsWith("/")) {
    if (/\.(ts|tsx|mjs|js|json)$/.test(path)) return path;
  }
  for (const ext of EXTS) if (existsSync(path + ext)) return path + ext;
  return null;
}

export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith("@/")) base = resolvePath(ROOT, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const file = withExtension(base);
    if (file) return next(pathToFileURL(file).href, context);
  }
  return next(specifier, context);
}
