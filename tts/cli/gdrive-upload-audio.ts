import { loadEnvFromDir } from "../../env";
import { uploadAudioFileToGoogleDrive } from "../utils/audio-upload";
import {
  audioDir,
  audioExtensions,
  audioFormats,
  toolRootDir,
} from "../constants";
import path from "node:path";

loadEnvFromDir(toolRootDir);

async function main(): Promise<void> {
  const [audioFileArg] = process.argv.slice(2);

  if (!audioFileArg) {
    throw new Error(
      "Missing audio filename. Usage: npm run gdrive-upload-audio -- <audio-file>",
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

  await uploadAudioFileToGoogleDrive(audioPath);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
