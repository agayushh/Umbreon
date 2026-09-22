/** Write matched values into DOM controls, including React-controlled inputs. */

import type { FormField } from "@/shared/types";
import { jaccard, levenshteinRatio, normalize, tokenize } from "./text";

export function fillField(field: FormField, value: string): void {
  const el = field.element;

  if (el.tagName === "SELECT") {
    const select = el as HTMLSelectElement;
    const normalizedValue = value.trim().toLowerCase();
    let matchedOption: HTMLOptionElement | undefined;

    matchedOption = Array.from(select.options).find(
      (opt) =>
        opt.value.trim().toLowerCase() === normalizedValue ||
        opt.text.trim().toLowerCase() === normalizedValue,
    );

    if (!matchedOption) {
      matchedOption = Array.from(select.options).find(
        (opt) =>
          opt.value.trim().toLowerCase().includes(normalizedValue) ||
          opt.text.trim().toLowerCase().includes(normalizedValue) ||
          normalizedValue.includes(opt.value.trim().toLowerCase()) ||
          normalizedValue.includes(opt.text.trim().toLowerCase()),
      );
    }

    if (!matchedOption) {
      let bestScore = 0;
      for (const opt of Array.from(select.options)) {
        const optText = normalize(opt.text);
        const optValue = normalize(opt.value);
        const score = Math.max(
          levenshteinRatio(normalizedValue, optText),
          levenshteinRatio(normalizedValue, optValue),
          jaccard(tokenize(normalizedValue), tokenize(optText)),
        );
        if (score > bestScore && score > 0.4) {
          bestScore = score;
          matchedOption = opt;
        }
      }
    }

    if (matchedOption) {
      setReactValue(select, matchedOption.value);
    }
  } else if (
    el.tagName === "INPUT" &&
    (el as HTMLInputElement).type === "radio"
  ) {
    fillRadioGroup(el as HTMLInputElement, value);
  } else if (
    el.tagName === "INPUT" &&
    (el as HTMLInputElement).type === "checkbox"
  ) {
    fillCheckboxGroup(el as HTMLInputElement, value);
  } else if (
    (el as HTMLElement).getAttribute("contenteditable") === "true" ||
    (el as HTMLElement).getAttribute("role") === "textbox"
  ) {
    fillContentEditable(el as HTMLElement, value);
  } else {
    fillInputElement(el as HTMLInputElement | HTMLTextAreaElement, value);
  }
}

/**
 * Set value on a form input in a way that React-controlled inputs detect.
 * React listens for the native input value setter — direct `.value =` doesn't trigger it.
 */
function setReactValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  try {
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: value,
        inputType: "insertText",
      }),
    );
  } catch {
    /* jsdom / older engines */
  }
}

/** Set checkbox/radio checked so React controlled inputs see the change. */
function setReactChecked(el: HTMLInputElement, checked: boolean): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "checked")?.set;
  if (setter) {
    setter.call(el, checked);
  } else {
    el.checked = checked;
  }
  // click() helps some frameworks; change covers the rest
  el.dispatchEvent(new Event("click", { bubbles: true }));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fill a regular input/textarea (works for plain DOM and React). */
function fillInputElement(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  setReactValue(el, value);
  // Also try focus + insert for stubborn forms
  try {
    el.focus();
  } catch {
    // ignore
  }
}

/** Fill a contenteditable element (Google Forms long-answer uses this). */
function fillContentEditable(el: HTMLElement, value: string): void {
  el.focus();
  // Select all
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection?.removeAllRanges();
  selection?.addRange(range);

  // Try execCommand first (works in most contenteditable contexts)
  if (document.execCommand && document.queryCommandSupported("insertText")) {
    try {
      document.execCommand("insertText", false, value);
      return;
    } catch {
      // fall through
    }
  }

  // Fallback: set innerHTML and dispatch input
  el.innerHTML = "";
  const lines = value.split("\n");
  lines.forEach((line, idx) => {
    el.appendChild(document.createTextNode(line));
    if (idx < lines.length - 1) {
      el.appendChild(document.createElement("br"));
    }
  });
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fill a radio group: find option matching the value, check it. */
function fillRadioGroup(rep: HTMLInputElement, value: string): void {
  const name = rep.name;
  if (!name) {
    rep.checked = true;
    return;
  }
  const group = document.querySelectorAll<HTMLInputElement>(
    `input[type="radio"][name="${CSS.escape(name)}"]`,
  );
  const normVal = normalize(value);

  /** Extract visible label text from a radio button (value, aria-label, or nearby label). */
  const getRadioLabel = (radio: HTMLInputElement): string => {
    const direct =
      radio.value ||
      radio.getAttribute("aria-label") ||
      radio.id ||
      "";
    if (direct) return direct;
    // Google Forms / custom: option text lives in a sibling/parent label
    const parent = radio.closest("label") || radio.parentElement;
    if (parent?.textContent) return parent.textContent.trim();
    const sibLabel = radio.parentElement?.querySelector("label, span");
    if (sibLabel?.textContent) return sibLabel.textContent.trim();
    return "";
  };

  // First: exact match
  let target: HTMLInputElement | null = null;
  group.forEach((radio) => {
    if (target) return;
    const norm = normalize(getRadioLabel(radio));
    if (norm && norm === normVal) target = radio;
  });
  // Second: substring
  if (!target) {
    group.forEach((radio) => {
      if (target) return;
      const norm = normalize(getRadioLabel(radio));
      if (!norm) return;
      if (norm.includes(normVal) || normVal.includes(norm)) target = radio;
    });
  }
  // Third: fuzzy
  if (!target) {
    let bestScore = 0;
    group.forEach((radio) => {
      const norm = normalize(getRadioLabel(radio));
      if (!norm) return;
      const score = Math.max(
        levenshteinRatio(normVal, norm),
        jaccard(tokenize(normVal), tokenize(norm)),
      );
      if (score > bestScore && score > 0.5) {
        bestScore = score;
        target = radio;
      }
    });
  }

  if (target) {
    setReactChecked(target as HTMLInputElement, true);
  }
}

/**
 * Fill a checkbox group: split value into skill tokens and check all that match.
 * Used for "Select your skills" style questions.
 */
function fillCheckboxGroup(rep: HTMLInputElement, value: string): void {
  const name = rep.name;
  if (!name) {
    rep.checked = true;
    return;
  }
  const group = document.querySelectorAll<HTMLInputElement>(
    `input[type="checkbox"][name="${CSS.escape(name)}"]`,
  );
  // Split value on commas or spaces — each token is a candidate skill
  const tokens = value
    .split(/[,\s]+/)
    .map((t) => normalize(t))
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return;

  const getCheckboxLabel = (cb: HTMLInputElement): string => {
    return (
      cb.value ||
      cb.getAttribute("aria-label") ||
      cb.id ||
      cb.closest("label")?.textContent?.trim() ||
      cb.parentElement?.querySelector("label, span")?.textContent?.trim() ||
      cb.parentElement?.textContent?.trim() ||
      ""
    );
  };

  group.forEach((cb) => {
    const label = getCheckboxLabel(cb);
    const norm = normalize(label);

    // Check if any token matches this option
    const matches = tokens.some((t) => {
      if (norm === t) return true;
      if (norm.includes(t) || t.includes(norm)) return true;
      // Fuzzy with min length 3 to avoid noise
      if (t.length >= 3 && norm.length >= 3) {
        return levenshteinRatio(t, norm) > 0.7;
      }
      return false;
    });

    if (matches) {
      setReactChecked(cb, true);
    }
  });
}

