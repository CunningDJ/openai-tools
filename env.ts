import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const envDir = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(envDir, ".env"), quiet: true });
