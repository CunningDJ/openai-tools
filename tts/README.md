# tts

A tiny CLI for turning `.txt` and `.md` files into audio with OpenAI text-to-speech.

## Setup

Install dependencies from the repo root:

```bash
npm install
```

For environment variables, see the top-level [Env Setup](../README.md#env-setup).

Run the commands below from this `tts/` directory unless noted.

For Google Drive audio uploads, create a package-level `.env`:

```bash
cp .env.example .env
```

Then set the Drive folder ID. This is only required when using `--upload-gdrive`. Open the folder in Google Drive and copy the URL segment after `/folders/`:

```bash
TTS_GOOGLE_DRIVE_AUDIO_FOLDER_ID=your_drive_folder_id
```

Before the first Google Drive upload, run the top-level OAuth setup. See [Google Drive Uploads](../README.md#google-drive-uploads).

## Use

Put source files in `text/`. Bare filenames resolve there. The main TTS command also works from the repo root.

```bash
npm run tts -- my-file.md
```

Explicit paths resolve from where you run the command:

```bash
npm run tts -- text/my-file.md
npm run tts -- ../notes/my-file.md
```

By default, audio is written to `audio/` with a timestamped filename:

```text
audio/my-file.20260613_220531.mp3
```

Long files are split into temporary chunks in `audio/tmp/`, then combined into one final audio file. Chunks are deleted after a successful combine.

## Options

```bash
npm run tts -- my-file.md --voice alloy
npm run tts -- my-file.md --format wav
npm run tts -- my-file.md --output audio/narration.mp3
npm run tts -- my-file.md --upload-gdrive
npm run tts -- my-file.md --style "Calm, warm professor explaining clearly"
```

To retry uploading an existing final audio file in `audio/` without generating a new file:

```bash
npm run gdrive-upload-audio -- sharper_chatgpt_advice.20260614_203906.mp3
```

Run full help with:

```bash
npm run tts -- --help
```

## Notes

- Default model: `gpt-4o-mini-tts`
- Supported input: `.txt`, `.md`, `.markdown`
- Supported audio: `mp3`, `wav`, `flac`, `aac`, `opus`
- Supported voices: `alloy`, `ash`, `ballad`, `cedar`, `coral`, `fable`, `marin`, `nova`, `onyx`, `sage`, `verse`
- If you hit a quota error, check OpenAI billing and usage limits.
