import type {
  ContactFormPayload,
  ContactFormResponse,
} from "./contactFormTypes";

export const CONTACT_FORM_LIMITS = {
  name: 120,
  subject: 30,
  message: 2000,
  email: 254,
} as const;

export { validateContactForm } from "./contactFormValidation";

export type { ContactFormErrorCode } from "./contactFormValidation";

const parseContactFormResponse = (text: string): ContactFormResponse | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const data = JSON.parse(trimmed) as ContactFormResponse;
    if (data && typeof data.ok === "boolean") {
      return data;
    }
  } catch {
    return null;
  }
  return null;
};

export const submitContactForm = async (
  url: string,
  payload: ContactFormPayload,
): Promise<ContactFormResponse> => {
  const response = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      name: payload.name.trim(),
      subject: payload.subject.trim(),
      email: payload.email.trim(),
      message: payload.message.trim(),
      website: payload.website ?? "",
    }),
  });

  const text = await response.text();
  const parsed = parseContactFormResponse(text);

  if (parsed) {
    return parsed;
  }

  return {
    ok: false,
    error: "sendFailed",
  };
};
