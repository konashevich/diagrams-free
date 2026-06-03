import { setLocaleOverrides } from "@excalidraw/excalidraw/i18n";

import enOverrides from "./locale-overrides/en.json";

export const applyBranding = (): void => {
  setLocaleOverrides({ en: enOverrides });
};
