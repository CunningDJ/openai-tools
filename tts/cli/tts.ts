import { loadEnvFromDir } from "../../env";
import {
  audioFormats,
  inputDir,
  outputDir,
  repoRootDir,
  tempOutputDir,
  toolRootDir,
  type AudioFormat,
  ttsVoices,
  type TtsVoice,
} from "../constants";
import {
  getGoogleDriveAudioFolderId,
  uploadAudioFileToGoogleDrive,
} from "../utils/audio-upload";
import { splitTextForTts } from "../utils/text-chunking";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command, Option } from "commander";
import OpenAI, { APIError } from "openai";
import ora from "ora";

const invocationDir = path.resolve(process.env.INIT_CWD ?? process.cwd());
loadEnvFromDir(toolRootDir);

const supportedInputExtensions = [".txt", ".md", ".markdown"] as const;
const maxConcurrentSpeechRequests = 3;
const defaultVoice: TtsVoice = "alloy";
const defaultModel = "gpt-4o-mini-tts";
const defaultStyle =
  "Voice: Calm, intelligent, and warmly engaging, like a thoughtful professor explaining a useful idea. Delivery: Conversational and measured, with natural variation and light emphasis on important takeaways. Pacing: Steady and relaxed, pausing briefly between sections and after dense ideas. Phrasing: Make lists and headings sound natural when spoken. Tone: Clear, curious, grounded, and quietly confident. Avoid theatrical narration or salesy enthusiasm.";
const markdownInstructions =
  "The input is Markdown. Do not read Markdown syntax aloud. Treat headings as brief section transitions, bullets as list items, and blockquotes as quoted passages.";
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;

type CliOptions = {
  o?: string;
  out?: string;
  output?: string;
  uploadGdrive?: boolean;
  voice: TtsVoice;
  model: string;
  format: AudioFormat;
  style: string;
};

// CLI
const program = new Command();

program
  .name("tts")
  .description("Generate audio from a text or Markdown file.")
  .usage("<file> [options]")
  .showHelpAfterError("Usage: tts <file> [options]")
  .argument("<file>", "Input file path, or filename inside text/")
  .option(
    "-o, --output <path>",
    "Final output path. A timestamp is inserted before the extension.",
  )
  .addOption(new Option("--o <path>", "Alias for --output").hideHelp())
  .addOption(new Option("--out <path>", "Alias for --output").hideHelp())
  .option("--upload-gdrive", "Upload the final audio file to Google Drive")
  .addOption(
    new Option("-v, --voice <voice>", "Voice to use")
      .choices([...ttsVoices])
      .default(defaultVoice),
  )
  .option("-m, --model <model>", "TTS model to use", defaultModel)
  .option(
    "-f, --format <format>",
    "Audio format: mp3, wav, flac, aac, opus",
    "mp3",
  )
  .option("-s, --style <style>", "Speaking style/instructions", defaultStyle)
  .addHelpText(
    "after",
    `
Examples:
  $ npm run tts -- abc.md
  $ npm run tts -- text/abc.txt
  $ npm run tts -- abc.md --voice alloy
  $ npm run tts -- abc.md --format wav
  $ npm run tts -- abc.md --output audio/narration.mp3
  $ npm run tts -- abc.md --upload-gdrive
  $ npm run tts -- abc.md --style "Warm, thoughtful podcast narrator"
`,
  )
  .parse();

const [inputFileArg] = program.args;
const options = program.opts<CliOptions>();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Path helpers
function resolveInputPath(file: string): string {
  return file.includes(path.sep)
    ? resolveUserPath(file)
    : path.join(inputDir, file);
}

function resolveOutputPath(file: string): string {
  return resolveUserPath(file);
}

function getRequestedOutputPath(): string | undefined {
  return options.output ?? options.o ?? options.out;
}

function resolveUserPath(file: string): string {
  if (!path.isAbsolute(file) && isRepoRelativeToolPath(file)) {
    return path.join(repoRootDir, file);
  }

  return path.isAbsolute(file) ? file : path.resolve(invocationDir, file);
}

function isRepoRelativeToolPath(file: string): boolean {
  return file === "tts" || file.startsWith(`tts${path.sep}`);
}

function getDefaultOutputPath(inputPath: string, format: AudioFormat): string {
  const parsed = path.parse(inputPath);
  return path.join(outputDir, `${parsed.name}.${format}`);
}

function getTimestampedOutputPath(outputPath: string): string {
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}.${getTimestamp()}${parsed.ext}`);
}

function getTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function getAudioChunkPath(
  outputPath: string,
  chunkNumber: number,
  totalChunks: number,
): string {
  if (totalChunks === 1) return outputPath;

  const parsed = path.parse(outputPath);
  const chunkSuffix = String(chunkNumber).padStart(2, "0");
  return path.join(tempOutputDir, `${parsed.name}.${chunkSuffix}${parsed.ext}`);
}

// Validation helpers
function isSupportedInput(extension: string): boolean {
  return supportedInputExtensions.includes(
    extension as (typeof supportedInputExtensions)[number],
  );
}

function isAudioFormat(format: string): format is AudioFormat {
  return audioFormats.includes(format as AudioFormat);
}

function isMarkdown(extension: string): boolean {
  return extension === ".md" || extension === ".markdown";
}

async function assertReadableFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(
      `Input file not found: ${filePath}\nCreate a file like: ${path.join(inputDir, "example.md")}`,
    );
  }
}

// Text preparation
function getTtsInstructions(inputExtension: string): string {
  return isMarkdown(inputExtension)
    ? `${options.style} ${markdownInstructions}`
    : options.style;
}

// Error formatting
function formatCliError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof APIError && error.status === 429) {
    return [
      "The request reached OpenAI, but this API key/project does not currently have available billing quota.",
      "Billing: https://platform.openai.com/settings/organization/billing/overview",
      "Usage limits: https://platform.openai.com/settings/organization/limits",
      "Also check that OPENAI_API_KEY is for the project you expect.",
      message,
    ].join("\n");
  }

  return message;
}

// Audio generation
async function createSpeechFile(
  text: string,
  outputPath: string,
  instructions: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const response = await client.audio.speech.create({
    model: options.model,
    voice: options.voice,
    input: text,
    instructions,
    response_format: options.format,
  });

  const audio = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, audio);
}

async function createSpeechFiles(
  textChunks: string[],
  outputPath: string,
  instructions: string,
): Promise<string[]> {
  const audioChunkPaths = textChunks.map((_, index) =>
    getAudioChunkPath(outputPath, index + 1, textChunks.length),
  );
  const spinner =
    textChunks.length === 1
      ? ora(`Generating audio for ${outputPath} ...`).start()
      : ora(
          `Generating ${textChunks.length} audio chunks with up to ${maxConcurrentSpeechRequests} concurrent requests ...`,
        ).start();

  try {
    await runWithConcurrency(
      textChunks,
      maxConcurrentSpeechRequests,
      (textChunk, index) =>
        createSpeechFile(textChunk, audioChunkPaths[index], instructions),
    );
    spinner.succeed(
      textChunks.length === 1
        ? `Wrote ${outputPath}`
        : `Generated ${textChunks.length} audio chunks`,
    );
    return audioChunkPaths;
  } catch (error) {
    spinner.fail(
      textChunks.length === 1
        ? `Failed ${outputPath}`
        : "Failed to generate one or more audio chunks",
    );
    throw error;
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrencyLimit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  let failed = false;
  const workerCount = Math.min(concurrencyLimit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!failed && nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        await task(items[currentIndex], currentIndex);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });

  await Promise.all(workers);
}

// Audio combining
async function combineAudioFiles(
  audioChunkPaths: string[],
  outputPath: string,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide an ffmpeg binary path");
  }

  const concatListDir = await fs.mkdtemp(path.join(tmpdir(), "tts-openai-"));
  const concatListPath = path.join(concatListDir, "inputs.txt");
  const concatFileList = audioChunkPaths
    .map(
      (audioChunkPath) =>
        `file '${escapeConcatPath(path.resolve(audioChunkPath))}'`,
    )
    .join("\n");
  const spinner = ora(`Combining audio into ${outputPath} ...`).start();

  try {
    await fs.writeFile(concatListPath, `${concatFileList}\n`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await runFfmpeg([
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      outputPath,
    ]);
    spinner.succeed(`Combined ${outputPath}`);
  } catch (error) {
    spinner.fail(`Failed to combine ${outputPath}`);
    throw error;
  } finally {
    await fs.rm(concatListDir, { recursive: true, force: true });
  }
}

function escapeConcatPath(filePath: string): string {
  return filePath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function runFfmpeg(args: string[]): Promise<void> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide an ffmpeg binary path");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

async function removeFiles(pathsToRemove: string[]): Promise<void> {
  await Promise.all(
    pathsToRemove.map((filePath) => fs.unlink(filePath).catch(() => undefined)),
  );
}

// Main workflow
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in the repo root .env");
  }

  if (options.uploadGdrive) {
    getGoogleDriveAudioFolderId();
  }

  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(tempOutputDir, { recursive: true });

  const inputPath = resolveInputPath(inputFileArg);
  const inputExtension = path.extname(inputPath).toLowerCase();

  if (!isSupportedInput(inputExtension)) {
    throw new Error("Expected a .txt, .md, or .markdown file");
  }

  if (!isAudioFormat(options.format)) {
    throw new Error(`Expected audio format: ${audioFormats.join(", ")}`);
  }

  await assertReadableFile(inputPath);

  const rawText = await fs.readFile(inputPath, "utf8");
  const textChunks = splitTextForTts(rawText);
  const instructions = getTtsInstructions(inputExtension);
  const requestedOutputOption = getRequestedOutputPath();
  const requestedOutputPath =
    requestedOutputOption !== undefined
      ? resolveOutputPath(requestedOutputOption)
      : getDefaultOutputPath(inputPath, options.format);
  const outputPath = getTimestampedOutputPath(requestedOutputPath);

  if (textChunks.length === 0) {
    throw new Error("Input file is empty");
  }

  if (textChunks.length > 1) {
    console.log(`Split input into ${textChunks.length} chunks.`);
  }

  const audioChunkPaths = await createSpeechFiles(
    textChunks,
    outputPath,
    instructions,
  );

  if (audioChunkPaths.length > 1) {
    await combineAudioFiles(audioChunkPaths, outputPath);
    await removeFiles(audioChunkPaths);
  }

  if (options.uploadGdrive) {
    await uploadAudioFileToGoogleDrive(outputPath);
  }
}

main().catch((error: unknown) => {
  console.error(`Error: ${formatCliError(error)}`);
  process.exit(1);
});
