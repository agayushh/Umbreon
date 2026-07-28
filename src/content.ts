import { formFiller } from "./formFiller";
import { createLogger } from "./logger";
import { getFieldLabel } from "./fieldDetector";

const log = createLogger("Content");

// Guard against double-registration if the module is evaluated more than once
// in the same isolated world (e.g. re-injection without a full page reload).
const g = globalThis as typeof globalThis & {
  __fillitListenerRegistered?: boolean;
};

// ── Message listener ─────────────────────────────────────────────────

if (!g.__fillitListenerRegistered) {
  g.__fillitListenerRegistered = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Instant health-check used by the popup before real work
    if (message.action === "ping") {
      sendResponse({ ok: true });
      return false;
    }

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

    if (message.action === "fillSingleField") {
      const { fieldIndex, value } = message.data as {
        fieldIndex: number;
        value: string;
      };
      formFiller
        .fillSingleField(fieldIndex, value)
        .then((success) => {
          sendResponse({ success });
        })
        .catch((error) => {
          log.error("fillSingleField error", error);
          sendResponse({ success: false });
        });
      return true;
    }

    if (message.action === "precompute") {
      formFiller
        .precompute()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          log.error("Precompute error", error);
          sendResponse({ success: false });
        });
      return true;
    }
  });

  log.debug("Content script message listener ready");
}

// ── Form submission observer (learning) ──────────────────────────────

function observeFormSubmissions(): void {
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target as HTMLFormElement;
      if (!form || form.tagName !== "FORM") return;
      captureAndSendFormData(form);
    },
    true,
  );

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
        setTimeout(() => captureAndSendFormData(form), 100);
      }
    },
    true,
  );

  log.debug("Form submission observer active");
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
      log.debug(
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
    log.debug("Form filler initialized");
    observeFormSubmissions();
  })
  .catch((error) => {
    log.error("Failed to initialize form filler", error);
  });
