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
const SKIP_TYPES = new Set(["password", "hidden", "file", "submit", "button"]);
const SKIP_NAME_PATTERNS =
  /captcha|recaptcha|g-recaptcha|h-captcha|csrf|token|nonce/i;

/** Track last readyState to avoid duplicate logs. */
let lastReadyState = "";

/** Detect all fillable form fields on the current page. */
export function detectFormFields(): FormField[] {
  const fields: FormField[] = [];
  const seenGroupNames = new Set<string>();
  const readyState = document.readyState;
  const wasReady = lastReadyState === readyState;
  lastReadyState = readyState;

  if (!wasReady) log.debug("Starting detection, readyState=" + readyState);

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

  // Radio groups — represent each group as one field with a representative element
  const radioGroups = document.querySelectorAll<HTMLInputElement>(
    'input[type="radio"]',
  );
  const radioGroupMap = new Map<string, HTMLInputElement>();
  radioGroups.forEach((radio) => {
    if (shouldSkip(radio)) return;
    const name = radio.name || `_unnamed_${radioGroupMap.size}`;
    if (!radioGroupMap.has(name)) {
      radioGroupMap.set(name, radio);
    }
  });
  radioGroupMap.forEach((radio, name) => {
    if (seenGroupNames.has(name)) return;
    seenGroupNames.add(name);
    fields.push({
      element: radio,
      type: "radio",
      name,
      id: radio.id || "",
      placeholder: "",
      label: getFieldLabel(radio),
      required: radio.required || false,
    });
  });

  // Checkbox groups — represent each group as one field
  const checkboxGroups = document.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  const checkboxGroupMap = new Map<string, HTMLInputElement>();
  checkboxGroups.forEach((cb) => {
    if (shouldSkip(cb)) return;
    const name = cb.name || `_unnamed_cb_${checkboxGroupMap.size}`;
    if (!checkboxGroupMap.has(name)) {
      checkboxGroupMap.set(name, cb);
    }
  });
  checkboxGroupMap.forEach((cb, name) => {
    if (seenGroupNames.has(name)) return;
    seenGroupNames.add(name);
    fields.push({
      element: cb,
      type: "checkbox",
      name,
      id: cb.id || "",
      placeholder: "",
      label: getFieldLabel(cb),
      required: cb.required || false,
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

  log.debug(`Detected ${fields.length} fillable fields`);
  return fields;
}

// ── Helpers ──────────────────────────────────────────────────────────

function shouldSkip(el: HTMLElement): boolean {
  const input = el as HTMLInputElement;
  if (input.disabled) return true;
  // Only treat real form controls as readOnly (contenteditable has no readOnly)
  if (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    el.readOnly
  ) {
    return true;
  }
  if (input.type && SKIP_TYPES.has(input.type)) return true;
  // Skip inputs that are not visible (common for honeypots / closed dialogs)
  if (el instanceof HTMLElement) {
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      (el as HTMLInputElement).type === "hidden"
    ) {
      return true;
    }
  }
  const identifier = `${input.name || ""} ${input.id || ""} ${typeof input.className === "string" ? input.className : ""}`;
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

/** Prefer human-readable labels; reject pure machine names when better text exists. */
function isWeakLabel(text: string): boolean {
  if (!text) return true;
  // snake_case / camelCase / uuid-like identifiers are weak alone
  if (/^[a-z0-9]+([._-][a-z0-9]+)+$/i.test(text) && !/\s/.test(text)) {
    return true;
  }
  if (text.length <= 2) return true;
  return false;
}

/** Try multiple heuristics to find a human-readable label for a field. */
export function getFieldLabel(element: HTMLElement): string {
  const strategies: Array<() => string> = [
    // Explicit <label for="...">
    () => {
      if (!element.id) return "";
      try {
        const label = document.querySelector(
          `label[for="${CSS.escape(element.id)}"]`,
        );
        return label?.textContent?.trim() || "";
      } catch {
        return "";
      }
    },
    // Fieldset legend first for radios/checkboxes (group question, not option text)
    () => {
      const input = element as HTMLInputElement;
      if (input.type === "radio" || input.type === "checkbox") {
        const legend = element.closest("fieldset")?.querySelector("legend");
        return legend?.textContent?.trim() || "";
      }
      return "";
    },
    // Wrapping <label>
    () => {
      const wrap = element.closest("label");
      if (!wrap) return "";
      // For radio/checkbox, option label text is weak for matching profile keys
      const input = element as HTMLInputElement;
      if (input.type === "radio" || input.type === "checkbox") {
        const legend = element.closest("fieldset")?.querySelector("legend");
        if (legend) return ""; // already handled above
      }
      const clone = wrap.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("input, select, textarea").forEach((n) => n.remove());
      return clone.textContent?.trim() || wrap.textContent?.trim() || "";
    },
    // Fieldset legend for non-radio fields
    () => {
      const legend = element.closest("fieldset")?.querySelector("legend");
      return legend?.textContent?.trim() || "";
    },
    // Nearby label in closest container
    () => {
      const parent = element.closest("div, p, td, th, li, section");
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
    // Previous sibling text
    () => {
      const prev = element.previousElementSibling;
      return prev?.textContent?.trim() || "";
    },
    // aria-label
    () => element.getAttribute("aria-label") || "",
    // placeholder (often human-readable)
    () => (element as HTMLInputElement | HTMLTextAreaElement).placeholder || "",
    // Nearby headings (Google Forms / Indeed)
    () => getNearbyPromptText(element),
    // name / id last (machine identifiers)
    () => (element as HTMLInputElement | HTMLTextAreaElement).name || "",
    () => element.id || "",
  ];

  let fallback = "";
  for (const strategy of strategies) {
    const label = strategy();
    if (!label) continue;
    if (!isWeakLabel(label)) return label;
    if (!fallback) fallback = label;
  }
  return fallback;
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
