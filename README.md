# openai-tools

A personal workspace for small OpenAI-powered command line tools.

## Tools

- [`tts`](tts/): turns `.txt` and `.md` files into audio with OpenAI text-to-speech.

## Repo Layout

- Root Google Drive helpers live in `utils/`.
- TTS runnable scripts live in `tts/cli/`.
- TTS-local helpers live in `tts/utils/`.

## Setup

Install everything from the repo root. npm workspaces install the root utilities and tool packages together:

```bash
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

## Google Drive Uploads

Optional Google Drive uploads use OAuth. A plain Google API key cannot upload files to a personal Google Drive.

1. Enable the [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
2. Configure the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent), keep the app in Testing, and add yourself as a test user.
3. Create an [OAuth client ID](https://console.cloud.google.com/apis/credentials) with application type **Desktop app**.
4. Download the client JSON, rename it to `google-oauth-client.json`, and put it in the repo root.
5. Run the setup command and approve the browser consent flow:

```bash
npm run setup-gdrive
```

That creates `google-oauth-token.json` in the repo root. Both Google OAuth JSON files are gitignored.

### GDrive Uploader on a Headless Machine

Run `npm run setup-gdrive` once on a machine with a browser, then copy both files to the headless repo root:

```text
google-oauth-client.json
google-oauth-token.json
```

To print the consent URL without opening a browser automatically, use this. The browser still needs to reach the printed localhost callback URL.

```bash
GOOGLE_DRIVE_OAUTH_NO_BROWSER=1 npm run setup-gdrive
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
