import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFile: vi.fn(),
  drive: vi.fn(),
  getGoogleDriveAuth: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    drive: mocks.drive,
  },
}));

vi.mock("../gdrive-oauth", () => ({
  getGoogleDriveAuth: mocks.getGoogleDriveAuth,
}));

const { uploadFileToGoogleDrive } = await import("../gdrive");

const audioBuffer = Buffer.from("audio");
const authClient = "auth-client";
const driveFile = {
  id: "file-id",
  name: "narration.mp3",
  mimeType: "audio/mpeg",
  webViewLink: "https://drive.example/view",
  webContentLink: "https://drive.example/download",
};
const uploadOptions = {
  folderId: "folder-id",
  fileName: "narration.mp3",
  mimeType: "audio/mpeg",
};

function expectNoDriveUploadAttempt(): void {
  expect(mocks.getGoogleDriveAuth).not.toHaveBeenCalled();
  expect(mocks.drive).not.toHaveBeenCalled();
  expect(mocks.createFile).not.toHaveBeenCalled();
}

describe("uploadFileToGoogleDrive", () => {
  beforeEach(() => {
    mocks.createFile.mockReset();
    mocks.createFile.mockResolvedValue({
      data: driveFile,
    });
    mocks.drive.mockReset();
    mocks.drive.mockReturnValue({
      files: {
        create: mocks.createFile,
      },
    });
    mocks.getGoogleDriveAuth.mockReset();
    mocks.getGoogleDriveAuth.mockResolvedValue(authClient);
  });

  it("fails before auth when the folder ID is missing", async () => {
    await expect(uploadFileToGoogleDrive(audioBuffer)).resolves.toEqual({
      success: false,
      error: {
        message: "Missing Google Drive folder ID",
        code: undefined,
      },
    });

    expectNoDriveUploadAttempt();
  });

  it("uploads buffer sources through googleapis", async () => {
    await expect(
      uploadFileToGoogleDrive(audioBuffer, {
        ...uploadOptions,
        supportsAllDrives: false,
      }),
    ).resolves.toEqual({
      success: true,
      file: driveFile,
    });

    expect(mocks.getGoogleDriveAuth).toHaveBeenCalledOnce();
    expect(mocks.drive).toHaveBeenCalledWith({
      version: "v3",
      auth: authClient,
    });
    expect(mocks.createFile).toHaveBeenCalledWith({
      requestBody: {
        name: uploadOptions.fileName,
        parents: [uploadOptions.folderId],
      },
      media: {
        mimeType: uploadOptions.mimeType,
        body: expect.any(Readable),
      },
      fields: "id,name,mimeType,webViewLink,webContentLink",
      supportsAllDrives: false,
    });
  });

  it("returns vendor error details when googleapis rejects", async () => {
    mocks.createFile.mockRejectedValue(
      Object.assign(new Error("Drive rejected the upload"), { code: 403 }),
    );

    await expect(
      uploadFileToGoogleDrive(audioBuffer, uploadOptions),
    ).resolves.toEqual({
      success: false,
      error: {
        message: "Drive rejected the upload",
        code: 403,
      },
    });
  });
});
