import { loadEnvFromDir } from "../../env.js";
import { uploadFileToGoogleDrive } from "../../utils/gdrive.js";
import {
  audioDir,
  audioExtensions,
  audioFormats,
  toolRootDir,
} from "./constants.js";
import path from "node:path";

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

  console.log(`Uploading audio file: ${audioPath}`);

  const uploadResult = await uploadFileToGoogleDrive(audioPath, {
    folderId,
  });

  console.log(JSON.stringify({ googleDriveUpload: uploadResult }, null, 2));

  if (!uploadResult.success) {
    throw new Error(uploadResult.error.message);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
