import "../../env";
import { getGoogleDriveAuth } from "../gdrive-oauth";

async function main(): Promise<void> {
  await getGoogleDriveAuth();
  console.log("Google Drive OAuth is ready.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
