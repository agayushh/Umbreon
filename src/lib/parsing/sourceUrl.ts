/** Classify LinkedIn vs portfolio URLs for import. */

export type SourceKind = "linkedin" | "portfolio";

const URL_RE = /^https?:\/\/[^\s]+$/i;

export function looksLikeSourceUrl(raw: string): boolean {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return false;
  if (URL_RE.test(text)) return true;
  try {
    const withProto = text.includes("://") ? text : `https://${text}`;
    const url = new URL(withProto);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeSourceUrl(raw: string): string {
  const text = raw.trim();
  if (!text) throw new Error("Enter a LinkedIn or portfolio URL.");
  const withProto = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) profile or portfolio links are supported.");
  }
  url.hash = "";
  return url.toString();
}

export function classifySourceUrl(raw: string): SourceKind {
  const url = new URL(normalizeSourceUrl(raw));
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  return "portfolio";
}

export function assertImportableUrl(raw: string): { url: string; kind: SourceKind } {
  const url = normalizeSourceUrl(raw);
  const kind = classifySourceUrl(url);
  if (kind === "linkedin") {
    const path = new URL(url).pathname;
    if (!/\/in\/[A-Za-z0-9_-]+/i.test(path)) {
      throw new Error(
        "Use a LinkedIn profile URL such as https://www.linkedin.com/in/username",
      );
    }
  }
  return { url, kind };
}
