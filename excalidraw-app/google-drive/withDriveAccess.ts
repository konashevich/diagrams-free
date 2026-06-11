import { ensureAccessToken, handleDriveAuthFailure } from "./auth";
import { DriveApiError } from "./errors";

/** Run a Drive API action with token refresh and one 401 retry. */
export const withDriveAccess = async <T>(
  action: () => Promise<T>,
): Promise<T> => {
  await ensureAccessToken();
  try {
    return await action();
  } catch (err) {
    if (err instanceof DriveApiError && err.status === 401) {
      handleDriveAuthFailure();
      await ensureAccessToken();
      return await action();
    }
    throw err;
  }
};
