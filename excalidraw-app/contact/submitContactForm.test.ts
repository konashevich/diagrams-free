import { describe, expect, it } from "vitest";

import { validateContactForm } from "./contactFormValidation";

describe("validateContactForm", () => {
  it("rejects empty fields", () => {
    expect(validateContactForm({ name: "", subject: "", email: "", message: "" })).toBe(
      "nameRequired",
    );
  });

  it("rejects invalid email", () => {
    expect(
      validateContactForm({
        name: "Ada",
        subject: "Hi",
        email: "not-an-email",
        message: "Hello",
      }),
    ).toBe("emailInvalid");
  });

  it("rejects line breaks in subject", () => {
    expect(
      validateContactForm({
        name: "Ada",
        subject: "Hi\nthere",
        email: "ada@example.com",
        message: "Hello",
      }),
    ).toBe("unsafeCharacters");
  });

  it("accepts valid payload", () => {
    expect(
      validateContactForm({
        name: "Ada",
        subject: "Hi",
        email: "ada@example.com",
        message: "Hello",
      }),
    ).toBeNull();
  });
});
