/** DOM field detection extracted from aiService — keeps that file focused on AI logic. */

import { createLogger } from "./logger";
import type { FormField } from "./types";

const log = createLogger("FieldDetector");

/** CSS selectors for standard form inputs. */
const INPUT_SELECTORS = [
  'input[type="text"]',
  'input[type="email"]',
  'input[type="tel"]',
  'input[type="url"]',
  'input[type="number"]',
  'input[type="date"]',
  "textarea",
  "select",
];

/** Fields we should never attempt to auto-fill. */
const SKIP_TYPES = new Set(["password", "hidden", "file"]);
const SKIP_NAME_PATTERNS =
  /captcha|recaptcha|g-recaptcha|h-captcha|csrf|token|nonce/i;

/** Detect all fillable form fields on the current page. */
export function detectFormFields(): FormField[] {
  const fields: FormField[] = [];

  log.debug("Starting detection, readyState=" + document.readyState);

  // Standard inputs
  INPUT_SELECTORS.forEach((selector) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element) => {
      const input = element as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement;
      if (shouldSkip(input)) return;

      fields.push(buildField(input));
    });
  });

  // Contenteditable / ARIA textboxes (Google Forms, Indeed, etc.)
  const editableCandidates = document.querySelectorAll<HTMLElement>(
    '[contenteditable="true"], div[role="textbox"], textarea[aria-label], input[aria-label]',
  );
  editableCandidates.forEach((el) => {
    if (fields.some((f) => f.element === el)) return;
    if (shouldSkip(el)) return;

    fields.push({
      element: el,
      type: el.getAttribute("role") || "textbox",
      name: el.getAttribute("name") || "",
      id: el.id || "",
      placeholder: el.getAttribute("placeholder") || "",
      label: getFieldLabel(el),
      required: el.getAttribute("aria-required") === "true",
    });
  });

  log.info(`Detected ${fields.length} fillable fields`);
  return fields;
}

// ── Helpers ──────────────────────────────────────────────────────────

function shouldSkip(el: HTMLElement): boolean {
  const input = el as HTMLInputElement;
  if (input.disabled) return true;
  if ((input as HTMLInputElement | HTMLTextAreaElement).readOnly) return true;
  if (SKIP_TYPES.has(input.type)) return true;
  const identifier = `${input.name} ${input.id} ${input.className}`;
  if (SKIP_NAME_PATTERNS.test(identifier)) return true;
  return false;
}

function buildField(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): FormField {
  return {
    element: input,
    type: input.type || input.tagName.toLowerCase(),
    name: input.name || "",
    id: input.id || "",
    placeholder:
      (input as HTMLInputElement | HTMLTextAreaElement).placeholder || "",
    label: getFieldLabel(input),
    required: input.required || false,
  };
}

/** Try multiple heuristics to find a human-readable label for a field. */
export function getFieldLabel(element: HTMLElement): string {
  const strategies: Array<() => string> = [
    // Explicit <label for="...">
    () => {
      if (!element.id) return "";
      const label = document.querySelector(`label[for="${element.id}"]`);
      return label?.textContent?.trim() || "";
    },
    // Nearby label in closest container
    () => {
      const parent = element.closest("div, p, td, th");
      const label = parent?.querySelector("label");
      return label?.textContent?.trim() || "";
    },
    // aria-labelledby
    () => {
      const ids = element.getAttribute("aria-labelledby");
      if (!ids) return "";
      return ids
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() || "")
        .filter(Boolean)
        .join(" ");
    },
    // Fieldset legend
    () => {
      const legend = element.closest("fieldset")?.querySelector("legend");
      return legend?.textContent?.trim() || "";
    },
    // Previous sibling text
    () => {
      const prev = element.previousElementSibling;
      return prev?.textContent?.trim() || "";
    },
    // aria-label
    () => element.getAttribute("aria-label") || "",
    // placeholder / name / id
    () => (element as HTMLInputElement | HTMLTextAreaElement).placeholder || "",
    () => (element as HTMLInputElement | HTMLTextAreaElement).name || "",
    () => element.id || "",
    // Nearby headings (Google Forms / Indeed)
    () => getNearbyPromptText(element),
  ];

  for (const strategy of strategies) {
    const label = strategy();
    if (label) return label;
  }
  return "";
}

/** Walk nearby DOM to find a visible prompt/heading for a field. */
function getNearbyPromptText(element: HTMLElement): string {
  const container = element.closest("div, section, form") as HTMLElement | null;
  if (!container) return "";

  const CANDIDATES = [
    '[role="heading"]',
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "legend",
    "label",
    "p",
  ];

  // Previous-sibling crawl (up to 5 hops)
  let cursor: Element | null = element;
  for (let i = 0; i < 5 && cursor; i++) {
    const prev = cursor.previousElementSibling as HTMLElement | null;
    if (prev) {
      for (const sel of CANDIDATES) {
        const node = prev.matches(sel) ? prev : prev.querySelector(sel);
        const txt = node?.textContent?.trim();
        if (txt) return txt;
      }
    }
    cursor = prev;
  }

  // Parent crawl (up to 4 levels)
  let parent: HTMLElement | null = element.parentElement;
  for (let d = 0; d < 4 && parent; d++) {
    for (const sel of CANDIDATES) {
      const node = parent.matches(sel) ? parent : parent.querySelector(sel);
      const txt = node?.textContent?.trim();
      if (txt) return txt;
    }
    parent = parent.parentElement;
  }

  return "";
}
