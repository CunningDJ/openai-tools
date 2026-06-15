import "../env.js";
import { Blob, File } from "node:buffer";
import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

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
const defaultGoogleCredentialsFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "google-service-account.json",
);

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
    const auth = getGoogleDriveAuth();
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

function getGoogleDriveAuth() {
  const configuredKeyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const keyFile =
    configuredKeyFile ||
    (existsSync(defaultGoogleCredentialsFile)
      ? defaultGoogleCredentialsFile
      : undefined);

  if (keyFile) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: [googleDriveUploadScope],
    });
  }

  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(process.env.GOOGLE_DRIVE_PRIVATE_KEY);

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Drive credentials. Set GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY.",
    );
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: [googleDriveUploadScope],
  });
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

function normalizePrivateKey(privateKey: string | undefined): string | undefined {
  return privateKey?.replace(/\\n/g, "\n");
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
