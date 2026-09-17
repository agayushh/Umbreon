/** DOM field detection — finds fillable inputs across documents and shadow roots. */

import { createLogger } from "./logger";
import type { FormField } from "./types";

const log = createLogger("FieldDetector");

/** Fields we should never attempt to auto-fill. */
const SKIP_TYPES = new Set([
  "password",
  "hidden",
  "file",
  "submit",
  "button",
  "image",
  "reset",
  "color",
]);
const SKIP_NAME_PATTERNS =
  /captcha|recaptcha|g-recaptcha|h-captcha|csrf|token|nonce/i;

const AUTOCOMPLETE_LABELS: Record<string, string> = {
  name: "full name",
  "given-name": "first name",
  "additional-name": "middle name",
  "family-name": "last name",
  email: "email",
  username: "username",
  tel: "phone",
  "tel-national": "phone",
  "tel-local": "phone",
  "street-address": "street address",
  "address-line1": "street address",
  "address-line2": "address line 2",
  "address-level2": "city",
  "address-level1": "state",
  "postal-code": "zip code",
  country: "country",
  "country-name": "country",
  url: "website",
  organization: "company",
  "organization-title": "current role",
  bday: "date of birth",
  "bday-day": "birth day",
  "bday-month": "birth month",
  "bday-year": "birth year",
  sex: "gender",
  "honorific-prefix": "prefix",
};

function queryAllDeep(root: ParentNode, selector: string): Element[] {
  const found: Element[] = [];
  const visit = (node: ParentNode) => {
    node.querySelectorAll(selector).forEach((el) => found.push(el));
    node.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) visit(el.shadowRoot);
    });
  };
  visit(root);
  return found;
}

/** Detect all fillable form fields on the current page. */
export function detectFormFields(): FormField[] {
  const fields: FormField[] = [];
  const seen = new Set<Element>();
  const seenGroupNames = new Set<string>();

  const elements = queryAllDeep(
    document,
    'input, textarea, select, [contenteditable="true"], [role="textbox"]',
  );

  for (const element of elements) {
    if (seen.has(element)) continue;
    seen.add(element);
    if (shouldSkip(element as HTMLElement)) continue;

    const input = element as HTMLInputElement;
    const type = (
      input.type ||
      element.getAttribute("type") ||
      element.getAttribute("role") ||
      element.tagName.toLowerCase()
    ).toLowerCase();

    if (type === "radio") {
      const name = input.name || `_unnamed_${seenGroupNames.size}`;
      const groupKey = `radio:${name}`;
      if (seenGroupNames.has(groupKey)) continue;
      seenGroupNames.add(groupKey);
      fields.push(buildField(element as HTMLElement, "radio"));
      continue;
    }

    if (type === "checkbox") {
      const name = input.name || `_unnamed_cb_${seenGroupNames.size}`;
      const groupKey = `cb:${name}`;
      if (seenGroupNames.has(groupKey)) continue;
      seenGroupNames.add(groupKey);
      fields.push(buildField(element as HTMLElement, "checkbox"));
      continue;
    }

    fields.push(buildField(element as HTMLElement, type));
  }

  log.debug(`Detected ${fields.length} fillable fields`);
  return fields;
}

// ── Helpers ──────────────────────────────────────────────────────────

function shouldSkip(el: HTMLElement): boolean {
  const input = el as HTMLInputElement;
  if (input.disabled) return true;
  if (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    el.readOnly
  ) {
    return true;
  }
  if (input.type && SKIP_TYPES.has(input.type)) return true;

  if (el.getAttribute("aria-hidden") === "true") return true;

  try {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return true;
    }
  } catch {
    /* jsdom / detached */
  }

  const identifier = `${input.name || ""} ${input.id || ""} ${typeof input.className === "string" ? input.className : ""}`;
  if (SKIP_NAME_PATTERNS.test(identifier)) return true;
  return false;
}

function buildField(element: HTMLElement, type: string): FormField {
  const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  return {
    element,
    type,
    name: (input as HTMLInputElement).name || element.getAttribute("name") || "",
    id: element.id || "",
    placeholder:
      (input as HTMLInputElement | HTMLTextAreaElement).placeholder ||
      element.getAttribute("placeholder") ||
      "",
    label: getFieldLabel(element),
    required:
      (input as HTMLInputElement).required ||
      element.getAttribute("aria-required") === "true",
    autocomplete: (input as HTMLInputElement).autocomplete || element.getAttribute("autocomplete") || "",
  };
}

/** Prefer human-readable labels; reject pure machine names when better text exists. */
function isWeakLabel(text: string): boolean {
  if (!text) return true;
  if (/^[a-z0-9]+([._-][a-z0-9]+)+$/i.test(text) && !/\s/.test(text)) {
    return true;
  }
  if (text.length <= 2) return true;
  return false;
}

function autocompleteToLabel(value: string): string {
  const token = value.trim().split(/\s+/).pop() || "";
  return AUTOCOMPLETE_LABELS[token] || "";
}

function humanizeIdentifier(value: string): string {
  if (!value) return "";
  return value
    .replace(/\[\]$/g, "")
    .replace(/^[A-Za-z0-9_]+\[([A-Za-z0-9_]+)\]$/, "$1")
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
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
      const input = element as HTMLInputElement;
      if (input.type === "radio" || input.type === "checkbox") {
        const legend = element.closest("fieldset")?.querySelector("legend");
        if (legend) return "";
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
    // Nearby label in closest container (not the whole form)
    () => {
      const parent = element.closest("div, p, td, th, li, section");
      if (!parent || parent.tagName === "FORM") return "";
      const label = parent.querySelector("label");
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
    // Immediate previous sibling text (not a previous input)
    () => {
      const prev = element.previousElementSibling as HTMLElement | null;
      if (!prev) return "";
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(prev.tagName)) return "";
      return prev.textContent?.trim() || "";
    },
    // aria-label
    () => element.getAttribute("aria-label") || "",
    // placeholder (often human-readable)
    () => (element as HTMLInputElement | HTMLTextAreaElement).placeholder || "",
    // autocomplete (given-name, email, ...)
    () => autocompleteToLabel(element.getAttribute("autocomplete") || ""),
    // Machine name/id humanized — better than stealing another field's heading
    () => humanizeIdentifier((element as HTMLInputElement).name || ""),
    () => humanizeIdentifier(element.id || ""),
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
  const promptSelector =
    '[role="heading"], h1, h2, h3, h4, h5, h6, legend, label, p';

  const fromNode = (node: Element | null): string => {
    if (!node || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(node.tagName)) return "";
    if ((node as HTMLElement).matches?.(promptSelector)) {
      const txt = node.textContent?.trim() || "";
      if (txt && txt.length < 140) return txt;
    }
    const nested = node.querySelector(promptSelector);
    const txt = nested?.textContent?.trim() || "";
    return txt.length > 0 && txt.length < 140 ? txt : "";
  };

  let prev = element.previousElementSibling;
  for (let i = 0; i < 2 && prev; i++) {
    const txt = fromNode(prev);
    if (txt) return txt;
    prev = prev.previousElementSibling;
  }

  let parent: HTMLElement | null = element.parentElement;
  for (let d = 0; d < 3 && parent && parent.tagName !== "FORM" && parent.tagName !== "BODY"; d++) {
    const txt = fromNode(parent.previousElementSibling);
    if (txt) return txt;
    parent = parent.parentElement;
  }

  return "";
}
