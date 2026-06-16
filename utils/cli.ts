import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Returns true when a CLI module is the process entrypoint.
 * Pass the caller's `import.meta.url`.
 */
export function checkIsDirectlyCalledFile(moduleUrl: string): boolean {
  const entrypointPath = process.argv[1];

  if (!entrypointPath) {
    return false;
  }

  return moduleUrl === pathToFileURL(path.resolve(entrypointPath)).href;
}
