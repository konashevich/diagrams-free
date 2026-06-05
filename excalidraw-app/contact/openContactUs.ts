import { CONTACT_US_OPEN_EVENT } from "@excalidraw/excalidraw/constants/contactUs";

export { CONTACT_US_OPEN_EVENT };

export const openContactUsDialog = (): void => {
  window.dispatchEvent(new CustomEvent(CONTACT_US_OPEN_EVENT));
};
