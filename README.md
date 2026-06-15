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

For Google Drive uploads, use OAuth credentials. A plain Google API key cannot upload files to Drive.

1. Enable the Google Drive API: https://console.cloud.google.com/apis/library/drive.googleapis.com
2. Configure the OAuth consent screen and add yourself as a test user: https://console.cloud.google.com/apis/credentials/consent
3. Create an OAuth client ID: https://console.cloud.google.com/apis/credentials
4. Choose **Desktop app** as the application type.
5. Download the client JSON, rename it to `google-oauth-client.json`, and put it in the repo root. This file is gitignored.

The first Google Drive upload opens a browser consent flow and saves `google-oauth-token.json` in the repo root. That token file is also gitignored. Future uploads reuse it.

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
