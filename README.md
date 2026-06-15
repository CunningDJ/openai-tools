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

For Google Drive uploads, use write-capable credentials in the top-level `.env`.
A plain Google API key cannot upload files to Drive.

The easiest setup for unattended uploads is a service account JSON file, but it must upload into a Shared Drive. Service accounts don't have personal Drive storage quota, so uploads to a normal My Drive folder can fail with a storage quota error.

1. In Google Cloud, create a service account: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Create and download a JSON key for that service account.
3. Rename the downloaded file to `google-service-account.json` and put it in the repo root. This file is gitignored.
4. Create or choose a folder in a Shared Drive.
5. Open the JSON file, copy its `client_email`, and add that email to the Shared Drive or target folder with permission to add files. If you skip this, uploads usually fail with `File not found` for the folder ID.

If you want to keep the JSON file somewhere else, set its absolute path in `.env`:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/google-service-account.json
```

If a JSON file is awkward for your environment, set the service account values directly in `.env`:

```bash
GOOGLE_DRIVE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

If you need to upload into your personal My Drive instead of a Shared Drive, use an OAuth user flow rather than a service account.

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
