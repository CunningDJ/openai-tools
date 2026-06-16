import { loadEnvFromDir } from "../../env";
import { uploadAudioFileToGoogleDrive } from "../utils/audio-upload";
import { checkIsDirectlyCalledFile } from "../../utils/cli";
import {
  audioDir,
  audioExtensions,
  audioFormats,
  toolRootDir,
} from "../constants";
import path from "node:path";

export async function main(): Promise<void> {
  loadEnvFromDir(toolRootDir);

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

if (checkIsDirectlyCalledFile(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
}
