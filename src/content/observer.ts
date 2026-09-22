import { createLogger } from "@/shared/logger";
import { getFieldLabel } from "@/lib/detection/fieldDetector";
import { Action } from "@/shared/messages";

const log = createLogger("Content");

export function observeFormSubmissions(): void {
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
        action: Action.FormSubmitted,
        data: { domain, fields },
      });
    }
  } catch (error) {
    log.error("Failed to capture form data", error);
  }
}
