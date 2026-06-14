# openai-tools

A personal workspace for small OpenAI-powered command line tools.

## Tools

- [`tts`](tts/): turns `.txt` and `.md` files into audio with OpenAI text-to-speech.

## Setup

Install the shared dependencies, then the dependencies for the tool you want to use:

```bash
npm install
cd tts
npm install
```

## Env Setup

Create a top-level `.env` file:

```bash
cp .env.example .env
```

Then add your OpenAI API key:

```bash
OPENAI_API_KEY=your_api_key_here
```

## Use

Run the TTS tool from the repo root:

```bash
npm run tts -- my-file.md
```

Or from inside the tool folder:

```bash
cd tts
npm run tts -- my-file.md
```

See [`tts/README.md`](tts/README.md) for TTS-specific usage and options.
