/** @OnlyCurrentDoc */

/**
 * Health check for web app deployment (GET).
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet() {
  return jsonResponse({ ok: true, service: "diagrams.free-contact" });
}

var SUPPORT_EMAIL = "support@diagrams.free";
var FALLBACK_EMAIL = "konashevich@gmail.com";
/** Inbox that receives support@ (Cloudflare routing). Skip duplicate confirmation here. */
var OWNER_INBOX = FALLBACK_EMAIL;
var FROM_NAME = "diagrams.free";

var LIMITS = {
  name: 120,
  subject: 30,
  message: 2000,
};

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "Missing body" });
    }

    var payload = JSON.parse(e.postData.contents);
    var validationError = validatePayload(payload);
    if (validationError) {
      return jsonResponse({ ok: false, error: validationError });
    }

    if (payload.website && String(payload.website).trim()) {
      return jsonResponse({ ok: true });
    }

    if (isRateLimited(payload.email)) {
      return jsonResponse({
        ok: false,
        error: "rateLimited",
      });
    }

    var name = trim(payload.name);
    var subject = trim(payload.subject);
    var email = trim(payload.email);
    var message = trim(payload.message);
    var timestamp = new Date().toISOString();

    var supportSubject = "[diagrams.free] " + subject;
    var supportBody =
      "Contact form submission\n\n" +
      "Name: " +
      name +
      "\n" +
      "Email: " +
      email +
      "\n" +
      "Time (UTC): " +
      timestamp +
      "\n\n" +
      "Message:\n" +
      message;

    sendToSupport(supportSubject, supportBody, email);
    recordSubmission(email);

    var confirmSubject = "We received your message — diagrams.free";
    var confirmBody =
      "Hi " +
      name +
      ",\n\n" +
      "Thank you for contacting diagrams.free. We received your message about \"" +
      subject +
      "\" and will reply to this email address when we can.\n\n" +
      "— diagrams.free support";

    if (!isOwnerInbox(email)) {
      try {
        GmailApp.sendEmail(
          email,
          confirmSubject,
          confirmBody,
          outboundOptions(SUPPORT_EMAIL),
        );
      } catch (confirmError) {
        console.warn("Confirmation email failed: " + confirmError);
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({
      ok: false,
      error: "Could not send message. Please try again later.",
    });
  }
}

/**
 * @param {object} payload
 * @returns {string|null}
 */
function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Invalid request";
  }

  var name = trim(payload.name);
  var subject = trim(payload.subject);
  var email = trim(payload.email);
  var message = trim(payload.message);

  if (hasUnsafeLineBreaks(name, subject, email, message)) {
    return "Invalid characters in form";
  }

  if (!name) {
    return "Name is required";
  }
  if (name.length > LIMITS.name) {
    return "Name is too long";
  }
  if (!subject) {
    return "Subject is required";
  }
  if (subject.length > LIMITS.subject) {
    return "Subject is too long";
  }
  if (!email) {
    return "Email is required";
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return "Invalid email address";
  }
  if (!message) {
    return "Message is required";
  }
  if (message.length > LIMITS.message) {
    return "Message is too long";
  }

  return null;
}

/**
 * @param {string} subject
 * @param {string} body
 * @param {string} replyTo
 */
function sendToSupport(subject, body, replyTo) {
  try {
    GmailApp.sendEmail(
      SUPPORT_EMAIL,
      subject,
      body,
      outboundOptions(replyTo),
    );
  } catch (firstError) {
    console.warn("Support send as support@ failed: " + firstError);
    try {
      GmailApp.sendEmail(
        SUPPORT_EMAIL,
        subject,
        body,
        outboundOptionsFallback(replyTo),
      );
    } catch (secondError) {
      console.warn("Support send failed, using fallback inbox: " + secondError);
      GmailApp.sendEmail(
        FALLBACK_EMAIL,
        "[contact-form-fallback] " + subject,
        body + "\n\n(Original To: " + SUPPORT_EMAIL + ")",
        outboundOptionsFallback(replyTo),
      );
    }
  }
}

/**
 * Send as support@ (Gmail “Send mail as” alias on the script account).
 * @param {string} replyTo
 * @returns {GoogleAppsScript.Mail.MailAdvancedParameters}
 */
function outboundOptions(replyTo) {
  return {
    from: SUPPORT_EMAIL,
    name: FROM_NAME,
    replyTo: replyTo || SUPPORT_EMAIL,
  };
}

/**
 * If sending as support@ fails, fall back to default account From.
 * @param {string} replyTo
 * @returns {GoogleAppsScript.Mail.MailAdvancedParameters}
 */
function outboundOptionsFallback(replyTo) {
  return {
    name: FROM_NAME,
    replyTo: replyTo || SUPPORT_EMAIL,
  };
}

/**
 * @param {string} email
 * @returns {boolean}
 */
function isRateLimited(email) {
  var key = "contact:" + email.toLowerCase();
  var cache = CacheService.getScriptCache();
  if (cache.get(key)) {
    return true;
  }
  return false;
}

/**
 * @param {string} email
 */
function recordSubmission(email) {
  var key = "contact:" + email.toLowerCase();
  CacheService.getScriptCache().put(key, "1", 300);
}

/**
 * @param {string} address
 * @returns {boolean}
 */
function isOwnerInbox(address) {
  return trim(address).toLowerCase() === OWNER_INBOX.toLowerCase();
}

/**
 * @param {...string} values
 * @returns {boolean}
 */
function hasUnsafeLineBreaks() {
  for (var i = 0; i < arguments.length; i++) {
    if (/[\r\n]/.test(arguments[i])) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string|undefined|null} value
 * @returns {string}
 */
function trim(value) {
  return String(value || "").trim();
}

/**
 * @param {{ ok: boolean, error?: string }} data
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
