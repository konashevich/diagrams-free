export type ContactFormPayload = {
  name: string;
  subject: string;
  email: string;
  message: string;
  /** Honeypot — must stay empty. */
  website?: string;
};

export type ContactFormResponse =
  | { ok: true }
  | { ok: false; error?: string };
