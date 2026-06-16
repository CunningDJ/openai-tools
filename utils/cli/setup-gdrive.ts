import "../../env";
import { checkIsDirectlyCalledFile } from "../cli";
import { getGoogleDriveAuth } from "../gdrive-oauth";

export async function main(): Promise<void> {
  await getGoogleDriveAuth();
  console.log("Google Drive OAuth is ready.");
}

if (checkIsDirectlyCalledFile(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
