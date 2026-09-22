/**
 * Resume, LinkedIn, and JSON profile parser for FillIt.
 * Accepts pasted LinkedIn/resume text, PDF resumes, FillIt backup JSON,
 * and flat profile JSON.
 */

import type { UserData, ContextEntry, FillItBackup, LearnedEntry } from "@/shared/types";

export interface ExtractionResult {
  userData: Partial<UserData>;
  contextEntries: Array<Omit<ContextEntry, "id" | "timestamp">>;
  extractedSkills: string[];
  rawTextPreview: string;
  learnedData?: Record<string, LearnedEntry[]>;
  source: "json" | "linkedin" | "resume" | "portfolio" | "text";
  profiles?: FillItBackup["profiles"];
  activeProfileId?: string;
}

const USER_DATA_KEYS: Array<keyof UserData> = [
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zipCode",
  "country",
  "dateOfBirth",
  "gender",
  "nationality",
  "linkedin",
  "github",
  "portfolio",
  "twitter",
  "website",
  "currentRole",
  "yearsOfExperience",
  "skills",
  "education",
  "certifications",
  "previousCompanies",
  "languages",
  "salary",
  "relocation",
  "availability",
  "workType",
  "summary",
];

const KEY_ALIASES: Record<string, keyof UserData> = {
  fullname: "name",
  full_name: "name",
  "full name": "name",
  legalname: "name",
  first_name: "firstName",
  firstname: "firstName",
  givenname: "firstName",
  "given name": "firstName",
  last_name: "lastName",
  lastname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  mail: "email",
  emailaddress: "email",
  email_address: "email",
  e_mail: "email",
  phonenumber: "phone",
  phone_number: "phone",
  mobile: "phone",
  mobilenumber: "phone",
  telephone: "phone",
  tel: "phone",
  street: "address",
  streetaddress: "address",
  street_address: "address",
  location: "city",
  town: "city",
  province: "state",
  region: "state",
  zip: "zipCode",
  zipcode: "zipCode",
  zip_code: "zipCode",
  postal: "zipCode",
  postalcode: "zipCode",
  postal_code: "zipCode",
  pincode: "zipCode",
  dob: "dateOfBirth",
  date_of_birth: "dateOfBirth",
  birthdate: "dateOfBirth",
  jobtitle: "currentRole",
  job_title: "currentRole",
  headline: "currentRole",
  title: "currentRole",
  role: "currentRole",
  designation: "currentRole",
  current_role: "currentRole",
  experience: "yearsOfExperience",
  years_of_experience: "yearsOfExperience",
  yearsofexperience: "yearsOfExperience",
  totalexperience: "yearsOfExperience",
  linkedinurl: "linkedin",
  linkedin_url: "linkedin",
  linkedinprofile: "linkedin",
  githuburl: "github",
  github_url: "github",
  website: "portfolio",
  personalwebsite: "portfolio",
  portfoliourl: "portfolio",
  site: "portfolio",
  work_type: "workType",
  workmode: "workType",
  noticeperiod: "availability",
  notice_period: "availability",
  about: "summary",
  bio: "summary",
  overview: "summary",
  professional_summary: "summary",
  professionalsummary: "summary",
  profile_summary: "summary",
};

const SECTION_HEADERS =
  /^(about|summary|professional summary|profile|objective|bio|experience|work experience|professional experience|work history|employment|employment history|career|education|skills|technical skills|core competencies|highlights|projects?|selected work|case studies|my work|featured|certifications?|licenses?(?:\s+and\s+certifications)?|honors?(?:\s+and\s+awards)?|awards?|volunteer|internships?|languages?|contact|contact info|publications?|accomplishments?|courses?)$/i;

function aliasKey(raw: string): keyof UserData | null {
  const compact = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const nosep = compact.replace(/_/g, "");
  if (USER_DATA_KEYS.includes(raw as keyof UserData)) return raw as keyof UserData;
  if (USER_DATA_KEYS.includes(compact as keyof UserData)) return compact as keyof UserData;
  return KEY_ALIASES[compact] || KEY_ALIASES[nosep] || KEY_ALIASES[raw.trim().toLowerCase()] || null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && "name" in (item as object)) {
          return String((item as { name: unknown }).name).trim();
        }
        return String(item).trim();
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;|•·\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function coerceScalar(value: unknown): string | boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return undefined;
}

function sanitizeUserData(input: Record<string, unknown>): Partial<UserData> {
  const userData: Partial<UserData> = {};

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = aliasKey(rawKey);
    if (!key) continue;

    if (key === "skills" || key === "certifications" || key === "previousCompanies" || key === "languages") {
      const arr = asStringArray(rawValue);
      if (arr.length) userData[key] = arr;
      continue;
    }

    if (key === "relocation") {
      if (typeof rawValue === "boolean") userData.relocation = rawValue;
      else if (typeof rawValue === "string") {
        userData.relocation = /^(yes|true|1|y)$/i.test(rawValue.trim());
      }
      continue;
    }

    if (key === "workType") {
      const v = String(rawValue || "").toLowerCase();
      if (v.includes("remote")) userData.workType = "remote";
      else if (v.includes("hybrid")) userData.workType = "hybrid";
      else if (v.includes("onsite") || v.includes("on-site") || v.includes("office")) {
        userData.workType = "onsite";
      }
      continue;
    }

    const scalar = coerceScalar(rawValue);
    if (typeof scalar === "string" && scalar) {
      (userData as Record<string, unknown>)[key] = scalar;
    }
  }

  if (userData.name && !userData.firstName) {
    const parts = userData.name.split(/\s+/).filter(Boolean);
    if (parts.length >= 1) userData.firstName = parts[0];
    if (parts.length >= 2) userData.lastName = parts.slice(1).join(" ");
  }
  if (!userData.name && (userData.firstName || userData.lastName)) {
    userData.name = [userData.firstName, userData.lastName].filter(Boolean).join(" ");
  }

  return userData;
}

function asContextEntries(value: unknown): Array<Omit<ContextEntry, "id" | "timestamp">> {
  if (!Array.isArray(value)) return [];
  const categories: ContextEntry["category"][] = [
    "project",
    "experience",
    "achievement",
    "leadership",
    "education",
    "certification",
    "other",
  ];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = String(row.title || row.name || row.company || "").trim();
      const description = String(
        row.description || row.summary || row.details || row.body || "",
      ).trim();
      if (!title && description.length < 20) return null;
      const catRaw = String(row.category || "experience").toLowerCase();
      const category = categories.includes(catRaw as ContextEntry["category"])
        ? (catRaw as ContextEntry["category"])
        : "experience";
      return {
        title: (title || "Experience").slice(0, 80),
        description: description.slice(0, 800),
        category,
        skills: asStringArray(row.skills).slice(0, 8),
        impact: String(row.impact || "").slice(0, 200),
      };
    })
    .filter(Boolean) as Array<Omit<ContextEntry, "id" | "timestamp">>;
}

function asLearnedData(value: unknown): Record<string, LearnedEntry[]> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj.entries)) {
    const grouped: Record<string, LearnedEntry[]> = {};
    for (const entry of obj.entries) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as LearnedEntry;
      if (!row.domain || !row.fieldLabel) continue;
      if (!grouped[row.domain]) grouped[row.domain] = [];
      grouped[row.domain].push(row);
    }
    return grouped;
  }
  const grouped: Record<string, LearnedEntry[]> = {};
  for (const [domain, entries] of Object.entries(obj)) {
    if (!Array.isArray(entries)) continue;
    grouped[domain] = entries.filter(
      (e) => e && typeof e === "object" && (e as LearnedEntry).fieldLabel,
    ) as LearnedEntry[];
  }
  return Object.keys(grouped).length ? grouped : undefined;
}

/** Parse FillIt backup JSON or a flat profile object. */
export function parseProfileObject(imported: unknown): ExtractionResult {
  if (Array.isArray(imported)) {
    const contextEntries = asContextEntries(imported);
    return {
      userData: {},
      contextEntries,
      extractedSkills: [],
      rawTextPreview: JSON.stringify(imported).slice(0, 300),
      source: "json",
    };
  }

  if (!imported || typeof imported !== "object") {
    return {
      userData: {},
      contextEntries: [],
      extractedSkills: [],
      rawTextPreview: "",
      source: "json",
    };
  }

  const obj = imported as Record<string, unknown> & FillItBackup;
  const nestedUser =
    obj.userData && typeof obj.userData === "object"
      ? (obj.userData as Record<string, unknown>)
      : obj;

  const userData = sanitizeUserData(nestedUser);
  const contextEntries = asContextEntries(obj.contextEntries || nestedUser.contextEntries);
  const learnedData = asLearnedData(obj.learnedData || obj.formHistory);
  const extractedSkills = userData.skills || [];
  const profiles = Array.isArray(obj.profiles) ? obj.profiles : undefined;
  const activeProfileId =
    typeof obj.activeProfileId === "string" ? obj.activeProfileId : undefined;

  if (profiles?.length) {
    const active =
      profiles.find((p) => p.id === activeProfileId) ||
      profiles.find((p) => p.id === (obj as { activeId?: string }).activeId) ||
      profiles[0];
    const fromActive = sanitizeUserData((active?.userData || {}) as Record<string, unknown>);
    const fromActiveCtx = asContextEntries(active?.contextEntries);
    return {
      userData: Object.keys(fromActive).length ? fromActive : userData,
      contextEntries: fromActiveCtx.length ? fromActiveCtx : contextEntries,
      extractedSkills: fromActive.skills || extractedSkills,
      learnedData,
      rawTextPreview: JSON.stringify(imported).slice(0, 300),
      source: "json",
      profiles,
      activeProfileId: active?.id || activeProfileId,
    };
  }

  return {
    userData,
    contextEntries,
    extractedSkills,
    learnedData,
    rawTextPreview: JSON.stringify(imported).slice(0, 300),
    source: "json",
  };
}

export function parseProfileJson(raw: string): ExtractionResult {
  return parseProfileObject(JSON.parse(raw));
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** Extract plain text from a PDF resume. Runs on the main thread (MV3 CSP). */
async function readPdfFile(file: File): Promise<string> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    } as never);
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      let line = "";
      let lastY: number | null = null;
      for (const item of textContent.items) {
        if (!("str" in item)) continue;
        const y = "transform" in item ? Number((item as { transform: number[] }).transform?.[5]) : 0;
        if (lastY !== null && Math.abs(y - lastY) > 4) {
          pages.push(line.trim());
          line = "";
        }
        line += (line && !line.endsWith(" ") ? " " : "") + item.str;
        lastY = y;
      }
      if (line.trim()) pages.push(line.trim());
    }

    return pages.filter(Boolean).join("\n").trim();
  } catch (error) {
    console.error("[FillIt] PDF reading error:", error);
    throw new Error(
      "Failed to read PDF file. Please use a text-based PDF, or paste the resume text / a JSON export instead.",
    );
  }
}

function htmlToText(raw: string): string {
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeHtml(raw: string): boolean {
  return /<(html|body|section|article|h[1-6]|p|div)[\s>]/i.test(raw);
}

function titleCaseWords(line: string): string {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function extractEmail(text: string): string | undefined {
  return text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)?.[0];
}

function extractPhone(text: string): string | undefined {
  const labeled = text.match(
    /(?:phone|mobile|tel|cell|whatsapp)[:\s]*([+()0-9.\s-]{8,22})/i,
  );
  if (labeled && labeled[1].replace(/\D/g, "").length >= 8) {
    return labeled[1].trim();
  }

  const matches = text.match(/\+?[0-9][0-9().\s-]{6,20}[0-9]/g) || [];
  for (const candidate of matches) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    if (
      /^(?:19|20)\d{2}$/.test(digits.slice(0, 4)) &&
      /^(?:19|20)\d{2}$/.test(digits.slice(-4))
    ) {
      continue;
    }
    return candidate.trim();
  }
  return undefined;
}

function withHttps(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function extractUrls(text: string): Partial<UserData> {
  const out: Partial<UserData> = {};
  const linkedin = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i,
  );
  if (linkedin) out.linkedin = withHttps(linkedin[0].replace(/\/$/, ""));
  const github = text.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i,
  );
  if (github) out.github = withHttps(github[0].replace(/\/$/, ""));
  const twitter = text.match(
    /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+\/?/i,
  );
  if (twitter) out.twitter = withHttps(twitter[0].replace(/\/$/, ""));
  const portfolio = text.match(
    /https?:\/\/(?!(?:www\.)?(?:linkedin|github|twitter|x)\.com)[A-Za-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i,
  );
  if (portfolio) out.portfolio = portfolio[0];
  return out;
}

function looksLikeName(line: string): boolean {
  if (!line || line.length > 60) return false;
  if (/@|https?:|linkedin|github|\d{3,}/i.test(line)) return false;
  if (/,/.test(line)) return false;
  if (/contact info|connections?|followers?|open to|message|connect/i.test(line)) {
    return false;
  }
  if (
    /(engineer|developer|designer|manager|founder|student|intern|analyst|scientist|consultant|director|officer|specialist|architect|teacher)/i.test(
      line,
    )
  ) {
    return false;
  }
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  const wordOk = (w: string) => /^[A-Za-z][A-Za-z.'-]*$/.test(w) && w.length > 1;
  if (!words.every(wordOk)) return false;
  const title = words.every((w) => /^[A-Z]/.test(w));
  const caps = words.every((w) => /^[A-Z][A-Z.'-]*$/.test(w));
  return title || caps;
}

function looksLikeRole(line: string): boolean {
  if (!line || line.length > 90) return false;
  if (/@|https?:/.test(line)) return false;
  if (/,/.test(line)) return false;
  return /(engineer|developer|designer|manager|founder|student|intern|analyst|scientist|consultant|lead|director|officer|specialist|architect|product|researcher|writer|teacher|staff)/i.test(
    line,
  );
}

function parseSkillsBlob(raw: string): string[] {
  const skills: string[] = [];
  for (const item of raw.split(/[,•·|/;\n\t]+/)) {
    const skill = item.replace(/^[-*]\s*/, "").replace(/\s+/g, " ").trim();
    if (skill.length < 2 || skill.length > 40) continue;
    if (/experience|education|project|show all|endorsed|^skills$/i.test(skill)) continue;
    if (!skills.includes(skill)) skills.push(skill);
  }
  return skills.slice(0, 40);
}

function splitSections(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/);
  const sections = new Map<string, string[]>();
  let current = "header";
  sections.set(current, []);

  for (const line of lines) {
    const trimmed = line.trim().replace(/[:]+$/, "");
    if (trimmed && SECTION_HEADERS.test(trimmed) && trimmed.length < 48) {
      current = trimmed.toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    sections.get(current)!.push(line);
  }

  const out = new Map<string, string>();
  for (const [key, value] of sections) {
    out.set(key, value.join("\n").trim());
  }
  return out;
}

function firstSection(sections: Map<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = sections.get(key);
    if (value) return value;
  }
  return "";
}

function blocksFromSection(section: string): string[] {
  const byBlank = section
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length >= 20);
  if (byBlank.length >= 2) return byBlank;

  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (looksLikeRole(line) && current.length) {
      blocks.push(current.join("\n"));
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks.filter((b) => b.length >= 20);
}

function inferCategory(title: string, body: string): ContextEntry["category"] {
  const hay = `${title} ${body}`;
  if (/lead|leadership|founder|president|captain|manager/i.test(hay)) return "leadership";
  if (/education|degree|thesis|university|college|bachelor|master/i.test(hay)) {
    return "education";
  }
  if (/certif|award|honor|license/i.test(hay)) return "certification";
  if (/project|built|developed|created/i.test(hay)) return "project";
  if (/experience|engineer|developer|intern|company|inc\.|llc/i.test(hay)) {
    return "experience";
  }
  return "experience";
}

function contextFromBlocks(
  blocks: string[],
  skills: string[],
): Array<Omit<ContextEntry, "id" | "timestamp">> {
  return blocks.slice(0, 12).map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = (lines[0] || "Experience").slice(0, 80);
    const description = (lines.slice(1).join(" ") || block).slice(0, 800);
    return {
      title,
      description,
      category: inferCategory(title, description),
      skills: skills.slice(0, 8),
      impact: "",
    };
  });
}

const MONTH =
  /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i;

function extractCompanies(experienceText: string): string[] {
  const companies: string[] = [];
  const push = (raw: string) => {
    const name = raw.replace(/\s*[·•|].*$/, "").replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 48) return;
    if (looksLikeRole(name)) return;
    if (MONTH.test(name) || /^\d{4}/.test(name)) return;
    if (!companies.includes(name)) companies.push(name);
  };

  const lines = experienceText.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const at = line.match(/\bat\s+([A-Z][A-Za-z0-9&.\s'-]{1,40})$/);
    if (at) push(at[1]);
    const dash = line.match(/[—–-]\s*([A-Z][A-Za-z0-9&.\s'-]{1,40})$/);
    if (dash) push(dash[1]);
    if (looksLikeRole(line) && lines[i + 1]) {
      const next = lines[i + 1];
      if (!looksLikeRole(next) && !MONTH.test(next) && !/^\d{4}/.test(next) && !/@/.test(next)) {
        push(next);
      }
    } else if (!looksLikeRole(line) && lines[i + 1] && looksLikeRole(lines[i + 1])) {
      if (!MONTH.test(line) && !/^\d{4}/.test(line) && !/@/.test(line)) {
        push(line);
      }
    }
  }
  return companies.slice(0, 8);
}

function extractListSection(raw: string): string[] {
  return raw
    .split(/[,•·|/;\n]+/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 48)
    .slice(0, 16);
}

function extractOpenGraph(html: string): Partial<UserData> {
  if (!/<meta\s/i.test(html)) return {};
  const get = (property: string) =>
    html.match(
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
    )?.[1] ||
    html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
        "i",
      ),
    )?.[1];

  const out: Partial<UserData> = {};
  const title = get("og:title") || get("twitter:title");
  const description = get("og:description") || get("description");
  const url = get("og:url");
  if (title && looksLikeName(title)) {
    out.name = titleCaseWords(title);
  } else if (title && looksLikeRole(title)) {
    out.currentRole = title.slice(0, 80);
  }
  if (description && description.length > 40) out.summary = description.slice(0, 800);
  if (url) {
    if (/linkedin\.com\/in\//i.test(url)) out.linkedin = withHttps(url);
    else if (/github\.com\//i.test(url)) out.github = withHttps(url);
    else out.portfolio = url;
  }
  return out;
}

function applySameAs(url: string, out: Partial<UserData>): void {
  const href = withHttps(url);
  if (/linkedin\.com\/in\//i.test(href)) out.linkedin = href.replace(/\/$/, "");
  else if (/github\.com\//i.test(href)) out.github = href.replace(/\/$/, "");
  else if (/(twitter\.com|x\.com)\//i.test(href)) out.twitter = href.replace(/\/$/, "");
  else if (!out.portfolio && /^https?:\/\//i.test(href)) out.portfolio = href;
}

function extractJsonLdPerson(html: string): Partial<UserData> {
  const out: Partial<UserData> = {};
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of blocks) {
    try {
      const parsed = JSON.parse(match[1]);
      const nodes = Array.isArray(parsed)
        ? parsed
        : parsed?.["@graph"] && Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String((node as { "@type"?: unknown })["@type"] || "");
        if (!/person/i.test(type)) continue;
        const person = node as Record<string, unknown>;
        const name = coerceScalar(person.name);
        if (typeof name === "string" && name) {
          out.name = name;
          const parts = name.split(/\s+/).filter(Boolean);
          out.firstName = parts[0];
          out.lastName = parts.slice(1).join(" ");
        }
        const job = coerceScalar(person.jobTitle);
        if (typeof job === "string" && job) out.currentRole = job.slice(0, 80);
        const email = coerceScalar(person.email);
        if (typeof email === "string" && email.includes("@")) {
          out.email = email.replace(/^mailto:/i, "");
        }
        const phone = coerceScalar(person.telephone);
        if (typeof phone === "string") out.phone = phone;
        const url = coerceScalar(person.url);
        if (typeof url === "string") applySameAs(url, out);
        const sameAs = asStringArray(person.sameAs);
        for (const href of sameAs) applySameAs(href, out);
        const address = person.address;
        if (address && typeof address === "object") {
          const addr = address as Record<string, unknown>;
          const city = coerceScalar(addr.addressLocality);
          const state = coerceScalar(addr.addressRegion);
          const country = coerceScalar(addr.addressCountry);
          if (typeof city === "string") out.city = city;
          if (typeof state === "string") out.state = state;
          if (typeof country === "string") out.country = country;
        }
        const worksFor = person.worksFor;
        if (worksFor && typeof worksFor === "object") {
          const company = coerceScalar((worksFor as { name?: unknown }).name);
          if (typeof company === "string" && company) {
            out.previousCompanies = [company];
          }
        }
        const description = coerceScalar(person.description);
        if (typeof description === "string" && description.length > 40) {
          out.summary = description.slice(0, 800);
        }
      }
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return out;
}

function mergePartialUserData(
  base: Partial<UserData>,
  overlay: Partial<UserData>,
): Partial<UserData> {
  const merged: Partial<UserData> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      const current = (merged as Record<string, unknown>)[key];
      const existing = Array.isArray(current) ? (current as string[]) : [];
      (merged as Record<string, unknown>)[key] = Array.from(
        new Set([...existing, ...value.map(String)]),
      );
      continue;
    }
    if (!(key in merged) || merged[key as keyof UserData] === undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

function extractLabeled(text: string, labels: string): string | undefined {
  const match = text.match(new RegExp(`(?:${labels})\\s*[:\\-]\\s*([^\\n\\r]{2,80})`, "i"));
  return match?.[1]?.trim();
}

function detectSource(
  cleanText: string,
  fileHint?: string,
): ExtractionResult["source"] {
  if (fileHint === "portfolio" || /<(html|body|section)/i.test(fileHint || "")) {
    return "portfolio";
  }
  if (/linkedin\.com|contact info|\d+\+?\s*connections?/i.test(cleanText)) {
    return "linkedin";
  }
  if (
    /portfolio|case study|selected work|featured project/i.test(cleanText) &&
    !/years of experience|work experience/i.test(cleanText.slice(0, 400))
  ) {
    return "portfolio";
  }
  return "resume";
}

/** Extract structured profile and context memory from resume / LinkedIn / portfolio text. */
export function parseResumeOrLinkedInText(
  text: string,
  options?: { sourceHint?: ExtractionResult["source"]; sourceUrl?: string },
): ExtractionResult {
  const raw = text.replace(/\r\n/g, "\n");
  const structured = mergePartialUserData(
    extractJsonLdPerson(raw),
    extractOpenGraph(raw),
  );
  const stripped = htmlToText(raw).trim();
  const cleanText = stripped || raw.trim();
  if (looksLikeJson(cleanText)) {
    try {
      return parseProfileJson(cleanText);
    } catch {
      /* fall through to text parsing */
    }
  }

  const lines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);
  const userData: Partial<UserData> = { ...structured };
  const source = options?.sourceHint || detectSource(cleanText);

  const email = extractEmail(cleanText);
  if (email) userData.email = email;
  const phone = extractPhone(cleanText);
  if (phone) userData.phone = phone;
  Object.assign(userData, extractUrls(cleanText));

  const labeledEmail = extractLabeled(cleanText, "e-?mail(?: address)?");
  if (labeledEmail && labeledEmail.includes("@")) userData.email = labeledEmail;
  const labeledPhone = extractLabeled(cleanText, "phone|mobile|telephone");
  if (labeledPhone && labeledPhone.replace(/\D/g, "").length >= 8) {
    userData.phone = labeledPhone;
  }

  const sections = splitSections(cleanText);
  const header = sections.get("header") || lines.slice(0, 10).join("\n");
  const headerLines = header.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of headerLines.slice(0, 8)) {
    if (looksLikeName(line)) {
      const words = line.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w));
      const name = titleCaseWords(words.join(" "));
      userData.name = name;
      const parts = name.split(/\s+/);
      userData.firstName = parts[0];
      userData.lastName = parts.slice(1).join(" ");
      break;
    }
  }

  if (!userData.currentRole) {
    const labeledRole = cleanText.match(
      /(?:current role|title|position|designation|headline)[\s:]+([^\n\r]+)/i,
    );
    if (labeledRole) userData.currentRole = labeledRole[1].trim().slice(0, 80);
  }
  if (!userData.currentRole) {
    for (const line of headerLines.slice(1, 6)) {
      if (looksLikeName(line)) continue;
      if (looksLikeRole(line)) {
        userData.currentRole = line.replace(/\s*[|•·].*$/, "").trim().slice(0, 80);
        break;
      }
    }
  }

  const locLabeled =
    extractLabeled(cleanText, "location|based in|lives in") ||
    cleanText.match(
      /\b([A-Z][a-zA-Z]+(?:[ ][A-Z][a-zA-Z]+)*),\s*([A-Z]{2}|[A-Z][a-zA-Z]+(?:[ ][A-Z][a-zA-Z]+)*)(?:,\s*([A-Z][a-zA-Z]+(?:[ ][A-Z][a-zA-Z]+)*))?/,
    )?.[0];
  if (locLabeled) {
    const parts = locLabeled.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts[0]) userData.city = userData.city || parts[0].replace(/^(location|based in|lives in)[:\s]+/i, "");
    if (parts[1] && parts[1].length <= 32) userData.state = userData.state || parts[1];
    if (parts[2]) userData.country = parts[2];
    else if (parts[1] && parts[1].length > 2 && /india|states|kingdom|canada|germany|france/i.test(parts[1])) {
      userData.country = parts[1];
      if (userData.state === parts[1]) delete userData.state;
    }
  }

  const expMatch = cleanText.match(
    /(\d+)\+?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:experience|exp)?/i,
  );
  if (expMatch) userData.yearsOfExperience = `${expMatch[1]}+ years`;

  const extractedSkills: string[] = [];
  const skillsSection = firstSection(sections, [
    "skills",
    "technical skills",
    "core competencies",
    "highlights",
  ]);
  for (const skill of parseSkillsBlob(skillsSection)) {
    extractedSkills.push(skill);
  }
  if (extractedSkills.length === 0) {
    const skillsMatch = cleanText.match(
      /(?:skills|technical skills|technologies|expertise|competencies)[\s:]*([^\n\r]+(?:\n[^\n\r]+){0,8})/i,
    );
    if (skillsMatch) {
      for (const skill of parseSkillsBlob(skillsMatch[1])) extractedSkills.push(skill);
    }
  }
  if (extractedSkills.length) userData.skills = extractedSkills;

  const eduSection = firstSection(sections, ["education"]);
  if (eduSection) {
    userData.education = eduSection
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(" — ")
      .slice(0, 240);
  } else {
    const eduMatch = cleanText.match(
      /(?:education|academics|university|college|qualification)[\s:]*([^\n\r]+(?:\n[^\n\r]+){0,2})/i,
    );
    if (eduMatch) userData.education = eduMatch[1].replace(/\n+/g, " ").trim().slice(0, 240);
  }

  const languages = extractListSection(firstSection(sections, ["language", "languages"]));
  if (languages.length) userData.languages = languages;

  const certs = extractListSection(
    firstSection(sections, ["certification", "certifications", "licenses and certifications"]),
  );
  if (certs.length) userData.certifications = certs;

  const contextEntries: Array<Omit<ContextEntry, "id" | "timestamp">> = [];
  const experienceText = firstSection(sections, [
    "experience",
    "work experience",
    "professional experience",
    "work history",
    "employment",
    "employment history",
    "career",
  ]);
  if (!userData.currentRole && experienceText) {
    const maybeRole = experienceText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .find((l) => looksLikeRole(l));
    if (maybeRole) userData.currentRole = maybeRole.slice(0, 80);
  }
  const companies = extractCompanies(experienceText);
  if (companies.length) userData.previousCompanies = companies;

  const projectText = firstSection(sections, [
    "projects",
    "project",
    "selected work",
    "case studies",
    "my work",
    "featured",
  ]);
  const aboutText = firstSection(sections, [
    "about",
    "summary",
    "professional summary",
    "profile",
    "objective",
    "bio",
  ]);

  if (aboutText.length > 40) {
    userData.summary = aboutText.replace(/\n+/g, " ").slice(0, 800);
  }

  contextEntries.push(...contextFromBlocks(blocksFromSection(experienceText), extractedSkills));
  contextEntries.push(
    ...contextFromBlocks(blocksFromSection(projectText), extractedSkills).map((e) => ({
      ...e,
      category: "project" as const,
    })),
  );

  if (aboutText.length > 40) {
    contextEntries.unshift({
      title: userData.currentRole || "Professional Overview",
      description: aboutText.replace(/\n+/g, " ").slice(0, 700),
      category: "experience",
      skills: extractedSkills.slice(0, 8),
      impact: "",
    });
  }

  if (contextEntries.length === 0 && cleanText.length > 50) {
    contextEntries.push({
      title: userData.currentRole || "Professional Overview",
      description: cleanText.slice(0, 600),
      category: "experience",
      skills: [...extractedSkills],
      impact: "",
    });
  }

  if (options?.sourceUrl) {
    if (source === "linkedin") {
      userData.linkedin = userData.linkedin || options.sourceUrl.replace(/\/$/, "");
    } else {
      userData.portfolio = userData.portfolio || options.sourceUrl;
    }
  }

  return {
    userData,
    contextEntries: contextEntries.slice(0, 16),
    extractedSkills,
    rawTextPreview: cleanText.slice(0, 400),
    source,
  };
}

/** Dispatcher used by the Options import UI. */
export async function parseImportedFile(file: File): Promise<ExtractionResult> {
  const name = file.name.toLowerCase();
  const htmlLike =
    name.endsWith(".html") ||
    name.endsWith(".htm") ||
    file.type === "text/html";
  const portfolioLike =
    htmlLike || /portfolio|case-study|casestudy/i.test(name);

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await readPdfFile(file);
    if (!text) {
      throw new Error("No text found in PDF. Try a text-based resume or paste the contents.");
    }
    return parseResumeOrLinkedInText(text, {
      sourceHint: portfolioLike ? "portfolio" : undefined,
    });
  }

  const text = await file.text();
  if (name.endsWith(".json") || file.type === "application/json" || looksLikeJson(text)) {
    try {
      return parseProfileJson(text);
    } catch {
      throw new Error("Invalid JSON file. Export a FillIt backup or a flat profile object.");
    }
  }

  return parseResumeOrLinkedInText(text, {
    sourceHint: portfolioLike || looksLikeHtml(text) ? "portfolio" : undefined,
  });
}

/** Parse a page or file fetched from a LinkedIn / portfolio URL. */
export function parseFetchedSource(
  text: string,
  meta: { kind: "linkedin" | "portfolio"; url: string; contentType?: string },
): ExtractionResult {
  if (/json/i.test(meta.contentType || "") || looksLikeJson(text)) {
    try {
      const parsed = parseProfileJson(text);
      if (meta.kind === "linkedin") {
        parsed.userData.linkedin = parsed.userData.linkedin || meta.url.replace(/\/$/, "");
      } else {
        parsed.userData.portfolio = parsed.userData.portfolio || meta.url;
      }
      return parsed;
    } catch {
      /* fall through */
    }
  }
  return parseResumeOrLinkedInText(text, {
    sourceHint: meta.kind === "linkedin" ? "linkedin" : "portfolio",
    sourceUrl: meta.url,
  });
}
