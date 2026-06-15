import { useEffect, useState } from "react";

import {
  isGoogleDriveEnabled,
  isGoogleDriveLinked,
  registerDriveLinkedHandler,
} from "../google-drive";

/** Reactive Google Drive linked flag for toolbar UI. */
export const useGoogleDriveLinked = (): boolean => {
  const [linked, setLinked] = useState(() => isGoogleDriveLinked());

  useEffect(() => {
    if (!isGoogleDriveEnabled()) {
      return;
    }

    const refresh = () => {
      setLinked(isGoogleDriveLinked());
    };

    const unregister = registerDriveLinkedHandler(refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      unregister();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return linked;
};
