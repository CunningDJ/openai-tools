# tts

A tiny CLI for turning `.txt` and `.md` files into audio with OpenAI text-to-speech.

## Setup

From the repo root:

```bash
npm install
cd tts
npm install
```

For environment variables, see the top-level [Env Setup](../README.md#env-setup).

## Use

Put source files in `text/`, then run:

```bash
npm run tts -- my-file.md
```

You can also run it from the repo root:

```bash
npm run tts -- my-file.md
```

You can also pass an explicit path:

```bash
npm run tts -- text/my-file.md
```

Audio is written to `audio/` with a timestamped filename, for example:

```text
audio/my-file.20260613_220531.mp3
```

Long files are split into temporary chunks in `audio/tmp/`, then combined into one final audio file. Chunks are deleted after a successful combine.

## Options

```bash
npm run tts -- my-file.md --voice alloy
npm run tts -- my-file.md --format wav
npm run tts -- my-file.md --style "Calm, warm professor explaining clearly"
```

Run full help with:

```bash
npm run tts -- --help
```

## Notes

- Default model: `gpt-4o-mini-tts`
- Supported input: `.txt`, `.md`, `.markdown`
- Supported audio: `mp3`, `wav`, `flac`, `aac`, `opus`
- If you hit a quota error, check OpenAI billing and usage limits.
