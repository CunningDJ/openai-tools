import { loadEnvFromDir } from "../../env";
import { uploadFileToGoogleDrive } from "../../utils/gdrive";
import {
  audioDir,
  audioExtensions,
  audioFormats,
  toolRootDir,
} from "./constants";
import path from "node:path";
import ora from "ora";

loadEnvFromDir(toolRootDir);

async function main(): Promise<void> {
  const [audioFileArg] = process.argv.slice(2);
  const folderId = process.env.TTS_GOOGLE_DRIVE_AUDIO_FOLDER_ID?.trim();

  if (!audioFileArg) {
    throw new Error(
      "Missing audio filename. Usage: npm run gdrive-upload-audio -- <audio-file>",
    );
  }

  if (!folderId) {
    throw new Error(
      "Missing TTS_GOOGLE_DRIVE_AUDIO_FOLDER_ID in tts/.env. Set it to the Google Drive folder ID for final audio uploads.",
    );
  }

  const audioPath = path.resolve(
    audioFileArg.includes(path.sep)
      ? audioFileArg
      : path.join(audioDir, audioFileArg),
  );

  if (!audioExtensions.has(path.extname(audioPath).toLowerCase())) {
    throw new Error(
      `Expected an audio file: ${audioFormats
        .map((format) => `.${format}`)
        .join(", ")}`,
    );
  }

  const spinner = ora(`Uploading ${audioPath} to Google Drive ...`).start();

  const uploadResult = await uploadFileToGoogleDrive(audioPath, {
    folderId,
  });

  if (uploadResult.success) {
    spinner.succeed(
      `Uploaded to Google Drive: ${uploadResult.file.name ?? audioPath}`,
    );
    return;
  }

  spinner.stop();
  throw new Error(`Google Drive upload failed: ${uploadResult.error.message}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
