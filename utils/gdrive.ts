import "../env.js";
import { Blob, File } from "node:buffer";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { CodeChallengeMethod } from "google-auth-library";

export type DriveUploadSource =
  | string
  | Buffer
  | Uint8Array
  | Readable
  | Blob
  | File;

export type DriveUploadOptions = {
  folderId?: string;
  fileName?: string;
  mimeType?: string;
  supportsAllDrives?: boolean;
};

type DriveUploadSuccess = {
  success: true;
  file: {
    id?: string | null;
    name?: string | null;
    mimeType?: string | null;
    webViewLink?: string | null;
    webContentLink?: string | null;
  };
};

type DriveUploadFailure = {
  success: false;
  error: {
    message: string;
    code?: string | number;
  };
};

export type DriveUploadResult = DriveUploadSuccess | DriveUploadFailure;

const googleDriveUploadScope = "https://www.googleapis.com/auth/drive.file";
const repoRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const oauthClientFile = path.join(repoRootDir, "google-oauth-client.json");
const oauthTokenFile = path.join(repoRootDir, "google-oauth-token.json");

export async function uploadFileToGoogleDrive(
  source: DriveUploadSource,
  options: DriveUploadOptions = {},
): Promise<DriveUploadResult> {
  try {
    const folderId = options.folderId?.trim();

    if (!folderId) {
      throw new Error("Missing Google Drive folder ID");
    }

    const { body, fileName, mimeType } = await getUploadMedia(source, options);
    const auth = await getGoogleDriveAuth();
    const drive = google.drive({ version: "v3", auth });
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body,
      },
      fields: "id,name,mimeType,webViewLink,webContentLink",
      supportsAllDrives: options.supportsAllDrives ?? true,
    });

    return {
      success: true,
      file: {
        id: response.data.id,
        name: response.data.name,
        mimeType: response.data.mimeType,
        webViewLink: response.data.webViewLink,
        webContentLink: response.data.webContentLink,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: getErrorMessage(error),
        code: getErrorCode(error),
      },
    };
  }
}

async function getGoogleDriveAuth() {
  const clientConfig = await readOAuthClientConfig();
  const oauthClient = new google.auth.OAuth2(
    clientConfig.clientId,
    clientConfig.clientSecret,
  );
  const savedToken = await readSavedOAuthToken();

  if (savedToken) {
    oauthClient.setCredentials(savedToken);
    return oauthClient;
  }

  const { code, redirectUri, codeVerifier } =
    await authorizeWithBrowser(oauthClient);
  const tokenResponse = await oauthClient.getToken({
    code,
    codeVerifier,
    redirect_uri: redirectUri,
  });

  oauthClient.setCredentials(tokenResponse.tokens);
  await fs.writeFile(
    oauthTokenFile,
    JSON.stringify(tokenResponse.tokens, null, 2),
  );
  return oauthClient;
}

type OAuthClientConfig = {
  clientId: string;
  clientSecret?: string;
};

type OAuthClientJson = {
  installed?: {
    client_id?: string;
    client_secret?: string;
  };
  web?: {
    client_id?: string;
    client_secret?: string;
  };
};

async function readOAuthClientConfig(): Promise<OAuthClientConfig> {
  const rawClient = await fs.readFile(oauthClientFile, "utf8").catch(() => {
    throw new Error(
      `Missing Google OAuth client file: ${oauthClientFile}. Create a Desktop OAuth client in Google Cloud and save its JSON here.`,
    );
  });
  const parsed = JSON.parse(rawClient) as OAuthClientJson;
  const credentials = parsed.installed ?? parsed.web;
  const clientId = credentials?.client_id;

  if (!clientId) {
    throw new Error(
      `Invalid Google OAuth client file: ${oauthClientFile}. Expected a Desktop OAuth client JSON file.`,
    );
  }

  return {
    clientId,
    clientSecret: credentials.client_secret,
  };
}

async function readSavedOAuthToken() {
  const rawToken = await fs
    .readFile(oauthTokenFile, "utf8")
    .catch(() => undefined);
  return rawToken === undefined ? undefined : JSON.parse(rawToken);
}

async function authorizeWithBrowser(
  oauthClient: InstanceType<typeof google.auth.OAuth2>,
): Promise<{
  code: string;
  redirectUri: string;
  codeVerifier: string;
}> {
  const { codeVerifier, codeChallenge } =
    await oauthClient.generateCodeVerifierAsync();

  return new Promise((resolve, reject) => {
    let serverOrigin = "";
    let redirectUri = "";
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(
        request.url ?? "/",
        serverOrigin || "http://127.0.0.1",
      );

      if (requestUrl.pathname !== "/oauth2callback") {
        response.writeHead(404).end();
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");

      if (error || !code) {
        response.writeHead(400).end("Google authorization failed.");
        server.close();
        reject(new Error(error ?? "Missing Google OAuth authorization code"));
        return;
      }

      response
        .writeHead(200, { "content-type": "text/plain" })
        .end("Google Drive authorization complete. You can close this tab.");
      server.close();
      resolve({
        code,
        redirectUri,
        codeVerifier,
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      serverOrigin = getServerOrigin(server);
      redirectUri = `${serverOrigin}/oauth2callback`;
      const authUrl = oauthClient.generateAuthUrl({
        access_type: "offline",
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        prompt: "consent",
        redirect_uri: redirectUri,
        scope: [googleDriveUploadScope],
      });

      console.log("Authorize Google Drive access in your browser:");
      console.log(authUrl);
      openBrowser(authUrl);
    });
  });
}

function getServerOrigin(server: http.Server): string {
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Google OAuth callback server is not listening");
  }

  return `http://127.0.0.1:${address.port}`;
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });

  child.on("error", () => undefined);
  child.unref();
}

async function getUploadMedia(
  source: DriveUploadSource,
  options: DriveUploadOptions,
): Promise<{
  body: Readable;
  fileName: string;
  mimeType: string;
}> {
  if (typeof source === "string") {
    const filePath = path.resolve(source);
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      throw new Error(`Google Drive upload source is not a file: ${filePath}`);
    }

    return {
      body: createReadStream(filePath),
      fileName: options.fileName ?? path.basename(filePath),
      mimeType: options.mimeType ?? getMimeType(filePath),
    };
  }

  if (source instanceof Readable) {
    return {
      body: source,
      fileName: requireFileName(options.fileName),
      mimeType: options.mimeType ?? "application/octet-stream",
    };
  }

  if (source instanceof Blob) {
    return {
      body: Readable.fromWeb(source.stream()),
      fileName: options.fileName ?? getBlobFileName(source),
      mimeType: options.mimeType ?? (source.type || "application/octet-stream"),
    };
  }

  return {
    body: Readable.from(source),
    fileName: requireFileName(options.fileName),
    mimeType: options.mimeType ?? "application/octet-stream",
  };
}

function getBlobFileName(source: Blob): string {
  return source instanceof File && source.name ? source.name : "upload.bin";
}

function requireFileName(fileName: string | undefined): string {
  if (!fileName?.trim()) {
    throw new Error("Missing fileName for Google Drive upload");
  }

  return fileName;
}

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".aac":
      return "audio/aac";
    case ".flac":
      return "audio/flac";
    case ".mp3":
      return "audio/mpeg";
    case ".opus":
      return "audio/opus";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorCode(error: unknown): string | number | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? code : undefined;
}
