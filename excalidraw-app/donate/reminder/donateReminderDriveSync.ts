import {
  downloadFileText,
  ensureDriveAppFolderId,
  findDonateReminderStateFileId,
  uploadTextFile,
  withDriveFolderRetry,
} from "../../google-drive/api";
import { getAccessToken, isGoogleDriveLinked } from "../../google-drive/auth";
import { isGoogleDriveEnabled } from "../../google-drive/constants";
import { DONATE_REMINDER_STATE_FILENAME } from "../../google-drive/paths";

import {
  parseDonateReminderStateJson,
  type DonateReminderState,
} from "./donateReminderState";

const canSyncToDrive = (): boolean =>
  isGoogleDriveEnabled() && isGoogleDriveLinked() && !!getAccessToken();

export const loadDonateReminderStateFromDrive =
  async (): Promise<DonateReminderState | null> => {
    if (!canSyncToDrive()) {
      return null;
    }
    return withDriveFolderRetry(async () => {
      const appFolderId = await ensureDriveAppFolderId();
      const fileId = await findDonateReminderStateFileId(appFolderId);
      if (!fileId) {
        return null;
      }
      const text = await downloadFileText(fileId);
      return parseDonateReminderStateJson(text);
    });
  };

export const saveDonateReminderStateToDrive = async (
  state: DonateReminderState,
): Promise<void> => {
  if (!canSyncToDrive()) {
    return;
  }
  await withDriveFolderRetry(async () => {
    const appFolderId = await ensureDriveAppFolderId();
    const existingFileId = await findDonateReminderStateFileId(appFolderId);
    await uploadTextFile({
      parentId: appFolderId,
      name: DONATE_REMINDER_STATE_FILENAME,
      content: JSON.stringify(state, null, 2),
      mimeType: "application/json",
      existingFileId,
    });
  });
};
