import { uploadFileToGoogleDrive } from "../../utils/gdrive";
import ora from "ora";

const googleDriveAudioFolderEnvVar = "TTS_GOOGLE_DRIVE_AUDIO_FOLDER_ID";

export function getGoogleDriveAudioFolderId(): string {
  const folderId = process.env[googleDriveAudioFolderEnvVar]?.trim();

  if (!folderId) {
    throw new Error(
      `Missing ${googleDriveAudioFolderEnvVar} in tts/.env. Set it to the Google Drive folder ID for final audio uploads.`,
    );
  }

  return folderId;
}

export async function uploadAudioFileToGoogleDrive(
  audioPath: string,
): Promise<void> {
  const folderId = getGoogleDriveAudioFolderId();
  const spinner = ora(`Uploading ${audioPath} to Google Drive ...`).start();
  const uploadResult = await uploadFileToGoogleDrive(audioPath, {
    folderId,
  });

  if (uploadResult.success) {
    spinner.succeed(
      `Uploaded to Google Drive: ${uploadResult.file.name ?? audioPath}`,
    );
    return;
  }

  spinner.stop();
  throw new Error(`Google Drive upload failed: ${uploadResult.error.message}`);
}
