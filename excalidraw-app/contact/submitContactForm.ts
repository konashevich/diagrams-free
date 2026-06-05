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

export const parseContactFormResponse = (
  text: string,
): ContactFormResponse | null => {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*"ok"\s*:\s*(?:true|false)[\s\S]*\}/);
  const candidate =
    jsonMatch?.[0] ?? (trimmed.startsWith("{") ? trimmed : null);

  if (!candidate) {
    return null;
  }

  try {
    const data = JSON.parse(candidate) as ContactFormResponse;
    if (data && typeof data.ok === "boolean") {
      return data;
    }
  } catch {
    return null;
  }
  return null;
};

const buildBody = (payload: ContactFormPayload): string =>
  JSON.stringify({
    name: payload.name.trim(),
    subject: payload.subject.trim(),
    email: payload.email.trim(),
    message: payload.message.trim(),
    website: payload.website ?? "",
  });

/**
 * Apps Script web apps process POST, then redirect to a one-time URL with the JSON reply.
 * The message is sent on the first leg; a parse failure must not look like a send failure.
 */
export const submitContactForm = async (
  url: string,
  payload: ContactFormPayload,
): Promise<ContactFormResponse> => {
  const body = buildBody(payload);
  const headers = { "Content-Type": "text/plain;charset=utf-8" };

  const response = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers,
    body,
  });

  const text = await response.text();
  const parsed = parseContactFormResponse(text);
  if (parsed) {
    return parsed;
  }

  // POST reached Google (redirect happened) but the JSON body was not readable — treat as sent.
  if (response.redirected) {
    return { ok: true };
  }

  return {
    ok: false,
    error: "sendFailed",
  };
};
