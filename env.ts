import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const envDir = path.dirname(fileURLToPath(import.meta.url));

export function loadEnvFromDir(dir: string): void {
  dotenv.config({ path: path.join(dir, ".env"), quiet: true });
}

loadEnvFromDir(envDir);
