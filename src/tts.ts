import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import OpenAI, { APIError } from "openai";
import ora from "ora";

const inputDir = "text";
const outputDir = "audio";
const tempOutputDir = path.join(outputDir, "tmp");
const audioFormats = ["mp3", "wav", "flac", "aac", "opus"] as const;
const supportedInputExtensions = [".txt", ".md", ".markdown"] as const;
const maxInputChars = 7_500;
const defaultVoice = "alloy";
const defaultModel = "gpt-4o-mini-tts";
const defaultStyle =
  "Voice: Calm, intelligent, and warmly engaging, like a thoughtful professor explaining a useful idea. Delivery: Conversational and measured, with natural variation and light emphasis on important takeaways. Pacing: Steady and relaxed, pausing briefly between sections and after dense ideas. Phrasing: Make lists and headings sound natural when spoken. Tone: Clear, curious, grounded, and quietly confident. Avoid theatrical narration or salesy enthusiasm.";
const markdownInstructions =
  "The input is Markdown. Do not read Markdown syntax aloud. Treat headings as brief section transitions, bullets as list items, and blockquotes as quoted passages.";
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;

type AudioFormat = (typeof audioFormats)[number];
type CliOptions = {
  out?: string;
  voice: string;
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
    "-o, --out <path>",
    "Output path. A timestamp is inserted before the extension.",
  )
  .option("-v, --voice <voice>", "Voice to use", defaultVoice)
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
  $ npm run tts -- abc.md --style "Warm, thoughtful podcast narrator"
`,
  )
  .parse();

const [fileArg] = program.args;
const options = program.opts<CliOptions>();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Path helpers
function resolveInputPath(file: string): string {
  return path.isAbsolute(file) || file.includes(path.sep)
    ? file
    : path.join(inputDir, file);
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

function getOutputPathForPart(
  outputPath: string,
  part: number,
  total: number,
): string {
  if (total === 1) return outputPath;

  const parsed = path.parse(outputPath);
  const suffix = String(part).padStart(2, "0");
  return path.join(tempOutputDir, `${parsed.name}.${suffix}${parsed.ext}`);
}

// Validation helpers
function isSupportedInput(ext: string): boolean {
  return supportedInputExtensions.includes(
    ext as (typeof supportedInputExtensions)[number],
  );
}

function isAudioFormat(format: string): format is AudioFormat {
  return audioFormats.includes(format as AudioFormat);
}

function isMarkdown(ext: string): boolean {
  return ext === ".md" || ext === ".markdown";
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
function getTtsInstructions(ext: string): string {
  return isMarkdown(ext)
    ? `${options.style} ${markdownInstructions}`
    : options.style;
}

function splitTextForTts(input: string): string[] {
  const blocks = input
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return chunkPieces(blocks.flatMap(splitOversizedBlock), "\n\n");
}

function splitOversizedBlock(block: string): string[] {
  if (block.length <= maxInputChars) return [block];

  const sentences = block.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [block];
  const pieces = sentences.map((sentence) => sentence.trim()).filter(Boolean);

  return chunkPieces(pieces, " ");
}

function chunkPieces(pieces: string[], separator: string): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces.flatMap(splitOversizedPiece)) {
    const next = current ? `${current}${separator}${piece}` : piece;

    if (next.length <= maxInputChars) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    current = piece;
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitOversizedPiece(piece: string): string[] {
  if (piece.length <= maxInputChars) return [piece];

  const words = piece.split(/\s+/);
  return words.length === 1 ? splitByLength(piece) : chunkPieces(words, " ");
}

function splitByLength(text: string): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += maxInputChars) {
    chunks.push(text.slice(index, index + maxInputChars));
  }

  return chunks;
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
  input: string,
  outputPath: string,
  instructions: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const spinner = ora(`Fetching audio for ${outputPath} ...`).start();

  try {
    const response = await client.audio.speech.create({
      model: options.model,
      voice: options.voice,
      input,
      instructions,
      response_format: options.format,
    });

    const audio = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, audio);

    spinner.succeed(`Wrote ${outputPath}`);
  } catch (error) {
    spinner.fail(`Failed ${outputPath}`);
    throw error;
  }
}

// Audio combining
async function combineAudioFiles(
  inputPaths: string[],
  outputPath: string,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide an ffmpeg binary path");
  }

  const tempDir = await fs.mkdtemp(path.join(tmpdir(), "tts-openai-"));
  const listPath = path.join(tempDir, "inputs.txt");
  const list = inputPaths
    .map((inputPath) => `file '${escapeConcatPath(path.resolve(inputPath))}'`)
    .join("\n");
  const spinner = ora(`Combining audio into ${outputPath} ...`).start();

  try {
    await fs.writeFile(listPath, `${list}\n`);
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
      listPath,
      "-c",
      "copy",
      outputPath,
    ]);
    spinner.succeed(`Combined ${outputPath}`);
  } catch (error) {
    spinner.fail(`Failed to combine ${outputPath}`);
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
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

async function removeFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map((filePath) => fs.unlink(filePath).catch(() => undefined)),
  );
}

// Main workflow
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in .env");
  }

  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(tempOutputDir, { recursive: true });

  const inputPath = resolveInputPath(fileArg);
  const ext = path.extname(inputPath).toLowerCase();

  if (!isSupportedInput(ext)) {
    throw new Error("Expected a .txt, .md, or .markdown file");
  }

  if (!isAudioFormat(options.format)) {
    throw new Error(`Expected audio format: ${audioFormats.join(", ")}`);
  }

  await assertReadableFile(inputPath);

  const rawText = await fs.readFile(inputPath, "utf8");
  const chunks = splitTextForTts(rawText);
  const instructions = getTtsInstructions(ext);
  const requestedOutputPath =
    options.out ?? getDefaultOutputPath(inputPath, options.format);
  const outputPath = getTimestampedOutputPath(requestedOutputPath);

  if (chunks.length === 0) {
    throw new Error("Input file is empty");
  }

  if (chunks.length > 1) {
    console.log(`Input split into ${chunks.length} parts.`);
  }

  const partPaths: string[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const partPath = getOutputPathForPart(outputPath, index + 1, chunks.length);
    await createSpeechFile(chunk, partPath, instructions);
    partPaths.push(partPath);
  }

  if (partPaths.length > 1) {
    await combineAudioFiles(partPaths, outputPath);
    await removeFiles(partPaths);
  }
}

main().catch((error: unknown) => {
  console.error(formatCliError(error));
  process.exit(1);
});
