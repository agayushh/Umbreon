import { formFiller } from "./formFiller";
import { createLogger } from "./logger";
import { getFieldLabel } from "./fieldDetector";

const log = createLogger("Content");

log.info("Content script loaded");

// ── Message listener ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "fillForm") {
    formFiller
      .fillForm()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        log.error("Fill form error", error);
        sendResponse({
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });
    return true;
  }

  if (message.action === "detectForms") {
    formFiller
      .detectForms()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        log.error("Detect forms error", error);
        sendResponse({ count: 0, fields: [] });
      });
    return true;
  }

  if (message.action === "clearCache") {
    formFiller.clearCache();
    sendResponse({ success: true });
    return true;
  }
});

// ── Form submission observer (learning) ──────────────────────────────

function observeFormSubmissions(): void {
  // Listen for standard form submit events
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target as HTMLFormElement;
      if (!form || form.tagName !== "FORM") return;
      captureAndSendFormData(form);
    },
    true,
  ); // capture phase to catch before default

  // Also observe click on submit buttons (for SPA / JS-submitted forms)
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement;
      if (!target) return;

      const button = target.closest(
        'button[type="submit"], input[type="submit"], button:not([type])',
      );
      if (!button) return;

      const form = button.closest("form");
      if (form) {
        // Small delay to let validations run
        setTimeout(() => captureAndSendFormData(form), 100);
      }
    },
    true,
  );

  log.info("Form submission observer active");
}

function captureAndSendFormData(form: HTMLFormElement): void {
  try {
    const domain = window.location.hostname;
    const fields: Array<{ label: string; value: string }> = [];

    const inputs = form.querySelectorAll("input, textarea, select");
    inputs.forEach((el) => {
      const input = el as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement;

      // Skip non-value fields
      if (
        input.type === "hidden" ||
        input.type === "password" ||
        input.type === "file"
      )
        return;
      if (/captcha|csrf|token|nonce/i.test(input.name + input.id)) return;

      const value = input.value?.trim();
      if (!value) return;

      const label = getFieldLabel(input as HTMLElement);
      if (!label) return;

      fields.push({ label: label.toLowerCase().trim(), value });
    });

    // Also check contenteditable elements inside the form
    const editables = form.querySelectorAll<HTMLElement>(
      '[contenteditable="true"], [role="textbox"]',
    );
    editables.forEach((el) => {
      const value = el.textContent?.trim();
      if (!value) return;
      const label = getFieldLabel(el);
      if (!label) return;
      fields.push({ label: label.toLowerCase().trim(), value });
    });

    if (fields.length > 0) {
      log.info(
        `Captured ${fields.length} fields from form submission on ${domain}`,
      );
      chrome.runtime.sendMessage({
        action: "formSubmitted",
        data: { domain, fields },
      });
    }
  } catch (error) {
    log.error("Failed to capture form data", error);
  }
}

// ── Initialize ───────────────────────────────────────────────────────

formFiller
  .initialize()
  .then(() => {
    log.info("Form filler initialized");
    observeFormSubmissions();
  })
  .catch((error) => {
    log.error("Failed to initialize form filler", error);
  });
