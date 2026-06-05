import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { t } from "@excalidraw/excalidraw/i18n";
import React, { useCallback, useId, useRef, useState } from "react";

import { CONTACT_FORM_URL } from "../branding/constants";

import {
  contactFormErrorToI18nKey,
  validateContactForm,
} from "./contactFormValidation";
import { CONTACT_FORM_LIMITS, submitContactForm } from "./submitContactForm";

import "./ContactUsDialog.scss";

import type { ContactFormPayload } from "./contactFormTypes";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const EMPTY_FORM: ContactFormPayload = {
  name: "",
  subject: "",
  email: "",
  message: "",
  website: "",
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

export const ContactUsDialog = ({ isOpen, onClose, excalidrawAPI }: Props) => {
  const [form, setForm] = useState<ContactFormPayload>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const honeypotId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const subjectCount = form.subject.length;
  const messageCount = form.message.length;

  const resetAndClose = useCallback(() => {
    setForm(EMPTY_FORM);
    setError(null);
    setSubmitting(false);
    onClose();
  }, [onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = validateContactForm(form);
    if (code) {
      setError(t(contactFormErrorToI18nKey(code)));
      return;
    }
    if (!CONTACT_FORM_URL) {
      setError(t("contactUs.errors.notConfigured"));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await submitContactForm(CONTACT_FORM_URL, form);
      if (result.ok) {
        resetAndClose();
        excalidrawAPI?.setToast({
          message: t("contactUs.toast.success"),
          closable: true,
          duration: 6000,
        });
        return;
      }
      const serverError = result.error;
      if (serverError === "sendFailed") {
        setError(t("contactUs.errors.sendFailed"));
      } else if (serverError?.includes("Too many messages")) {
        setError(t("contactUs.errors.rateLimited"));
      } else if (serverError) {
        setError(serverError);
      } else {
        setError(t("contactUs.errors.sendFailed"));
      }
    } catch {
      setError(t("contactUs.errors.sendFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog
      className="ContactUsDialog"
      size="small"
      title={t("contactUs.title")}
      onCloseRequest={resetAndClose}
    >
      <form
        ref={formRef}
        className="ContactUsDialog__form"
        onSubmit={handleSubmit}
        noValidate
      >
        <p className="ContactUsDialog__intro">{t("contactUs.intro")}</p>

        <TextField
          label={t("contactUs.fields.name")}
          value={form.name}
          onChange={(value) =>
            setForm((prev) => ({
              ...prev,
              name: value.slice(0, CONTACT_FORM_LIMITS.name),
            }))
          }
          fullWidth
        />

        <div className="ContactUsDialog__field">
          <TextField
            label={t("contactUs.fields.subject")}
            value={form.subject}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                subject: value.slice(0, CONTACT_FORM_LIMITS.subject),
              }))
            }
            fullWidth
          />
          <div className="ContactUsDialog__counter" aria-live="polite">
            {subjectCount}/{CONTACT_FORM_LIMITS.subject}
          </div>
        </div>

        <div className="ContactUsDialog__field">
          <label className="ContactUsDialog__textarea-label" htmlFor="contact-email">
            {t("contactUs.fields.email")}
          </label>
          <input
            id="contact-email"
            className="ContactUsDialog__input"
            type="email"
            autoComplete="email"
            required
            maxLength={CONTACT_FORM_LIMITS.email}
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                email: event.target.value.slice(0, CONTACT_FORM_LIMITS.email),
              }))
            }
          />
        </div>

        <div className="ContactUsDialog__field">
          <label className="ContactUsDialog__textarea-label" htmlFor="contact-message">
            {t("contactUs.fields.message")}
          </label>
          <textarea
            id="contact-message"
            className="ContactUsDialog__textarea"
            rows={6}
            maxLength={CONTACT_FORM_LIMITS.message}
            value={form.message}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, message: event.target.value }))
            }
            required
          />
          <div className="ContactUsDialog__counter" aria-live="polite">
            {messageCount}/{CONTACT_FORM_LIMITS.message}
          </div>
        </div>

        <div className="ContactUsDialog__honeypot" aria-hidden="true">
          <label htmlFor={honeypotId}>Website</label>
          <input
            id={honeypotId}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, website: event.target.value }))
            }
          />
        </div>

        {error && (
          <p className="ContactUsDialog__error" role="alert">
            {error}
          </p>
        )}

        <div className="ContactUsDialog__actions">
          <FilledButton
            variant="outlined"
            label={t("buttons.cancel")}
            onClick={resetAndClose}
            disabled={submitting}
          />
          <FilledButton
            label={t("contactUs.submit")}
            status={submitting ? "loading" : null}
            disabled={submitting}
            onClick={() => formRef.current?.requestSubmit()}
          />
        </div>
      </form>
    </Dialog>
  );
};
