import path from "node:path";
import { fileURLToPath } from "node:url";

export const toolRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
);
export const repoRootDir = path.resolve(toolRootDir, "..");
export const inputDir = path.join(toolRootDir, "text");
export const audioDir = path.join(toolRootDir, "audio");
export const outputDir = audioDir;
export const tempOutputDir = path.join(outputDir, "tmp");

export const audioFormats = ["mp3", "wav", "flac", "aac", "opus"] as const;
export type AudioFormat = (typeof audioFormats)[number];
export const audioExtensions = new Set<string>(
  audioFormats.map((format) => `.${format}`),
);

export const ttsVoices = [
  "alloy",
  "ash",
  "ballad",
  "cedar",
  "coral",
  "fable",
  "marin",
  "nova",
  "onyx",
  "sage",
  "verse",
] as const;
export type TtsVoice = (typeof ttsVoices)[number];
