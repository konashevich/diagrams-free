import type { ContactFormPayload } from "./contactFormTypes";

import { CONTACT_FORM_LIMITS } from "./submitContactForm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UNSAFE_LINE_RE = /[\r\n]/;

export type ContactFormErrorCode =
  | "nameRequired"
  | "nameTooLong"
  | "subjectRequired"
  | "subjectTooLong"
  | "emailRequired"
  | "emailInvalid"
  | "messageRequired"
  | "messageTooLong"
  | "unsafeCharacters";

export const validateContactForm = (
  payload: ContactFormPayload,
): ContactFormErrorCode | null => {
  const name = payload.name.trim();
  const subject = payload.subject.trim();
  const email = payload.email.trim();
  const message = payload.message.trim();

  const fields = [name, subject, email, message];
  if (fields.some((value) => UNSAFE_LINE_RE.test(value))) {
    return "unsafeCharacters";
  }

  if (!name) {
    return "nameRequired";
  }
  if (name.length > CONTACT_FORM_LIMITS.name) {
    return "nameTooLong";
  }
  if (!subject) {
    return "subjectRequired";
  }
  if (subject.length > CONTACT_FORM_LIMITS.subject) {
    return "subjectTooLong";
  }
  if (!email) {
    return "emailRequired";
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return "emailInvalid";
  }
  if (!message) {
    return "messageRequired";
  }
  if (message.length > CONTACT_FORM_LIMITS.message) {
    return "messageTooLong";
  }

  return null;
};

export const contactFormErrorToI18nKey = (
  code: ContactFormErrorCode,
): `contactUs.errors.${ContactFormErrorCode}` => `contactUs.errors.${code}`;
