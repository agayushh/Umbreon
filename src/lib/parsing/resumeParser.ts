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
  source: "json" | "linkedin" | "resume" | "text";
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
};

const SECTION_HEADERS =
  /^(about|summary|experience|work experience|employment|education|skills|technical skills|projects?|certifications?|licenses?(?:\s+and\s+certifications)?|honors?(?:\s+and\s+awards)?|awards?|volunteer|languages?|contact|contact info|featured|publications?|accomplishments?|courses?|profile)$/i;

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
  const portfolio = text.match(
    /https?:\/\/(?!(?:www\.)?(?:linkedin|github)\.com)[A-Za-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i,
  );
  if (portfolio) out.portfolio = portfolio[0];
  return out;
}

function looksLikeName(line: string): boolean {
  if (!line || line.length > 48) return false;
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
  const words = line.split(/\s+/);
  return (
    words.length >= 2 &&
    words.length <= 4 &&
    words.every((w) => /^[A-Z][A-Za-z.'-]*$/.test(w))
  );
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
    if (trimmed && SECTION_HEADERS.test(trimmed) && trimmed.length < 40) {
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

function blocksFromSection(section: string): string[] {
  return section
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length >= 20);
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
  return blocks.slice(0, 8).map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = (lines[0] || "Experience").slice(0, 80);
    const description = (lines.slice(1).join(" ") || block).slice(0, 600);
    return {
      title,
      description,
      category: inferCategory(title, description),
      skills: skills.slice(0, 6),
      impact: "",
    };
  });
}

/** Extract structured profile and context memory from resume / LinkedIn text. */
export function parseResumeOrLinkedInText(text: string): ExtractionResult {
  const cleanText = text.replace(/\r\n/g, "\n").trim();
  if (looksLikeJson(cleanText)) {
    try {
      return parseProfileJson(cleanText);
    } catch {
      /* fall through to text parsing */
    }
  }

  const lines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);
  const userData: Partial<UserData> = {};
  const isLinkedIn = /linkedin\.com|contact info|\d+\+?\s*connections?/i.test(cleanText);

  const email = extractEmail(cleanText);
  if (email) userData.email = email;
  const phone = extractPhone(cleanText);
  if (phone) userData.phone = phone;
  Object.assign(userData, extractUrls(cleanText));

  const sections = splitSections(cleanText);
  const header = sections.get("header") || lines.slice(0, 8).join("\n");
  const headerLines = header.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of headerLines.slice(0, 6)) {
    if (looksLikeName(line)) {
      const words = line.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w));
      userData.name = words.join(" ");
      userData.firstName = words[0];
      userData.lastName = words.slice(1).join(" ");
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
    for (const line of headerLines.slice(1, 5)) {
      if (looksLikeName(line)) continue;
      if (looksLikeRole(line)) {
        userData.currentRole = line.replace(/\s*[|•·].*$/, "").trim().slice(0, 80);
        break;
      }
    }
  }

  const locLabeled = cleanText.match(
    /\b([A-Z][a-zA-Z]+(?:[ ][A-Z][a-zA-Z]+)*),\s*([A-Z]{2}|[A-Z][a-zA-Z]+)(?:,\s*([A-Z][a-zA-Z]+(?:[ ][A-Z][a-zA-Z]+)*))?/,
  );
  if (locLabeled) {
    userData.city = userData.city || locLabeled[1];
    userData.state = userData.state || locLabeled[2];
    if (locLabeled[3]) userData.country = locLabeled[3];
  }

  const expMatch = cleanText.match(
    /(\d+)\+?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:experience|exp)?/i,
  );
  if (expMatch) userData.yearsOfExperience = `${expMatch[1]}+ years`;

  const extractedSkills: string[] = [];
  const skillsSection =
    sections.get("skills") ||
    sections.get("technical skills") ||
    "";
  for (const skill of parseSkillsBlob(skillsSection)) {
    extractedSkills.push(skill);
  }
  if (extractedSkills.length === 0) {
    const skillsMatch = cleanText.match(
      /(?:skills|technical skills|technologies|expertise|competencies)[\s:]*([^\n\r]+(?:\n[^\n\r]+){0,6})/i,
    );
    if (skillsMatch) {
      for (const skill of parseSkillsBlob(skillsMatch[1])) extractedSkills.push(skill);
    }
  }
  if (extractedSkills.length) userData.skills = extractedSkills;

  const eduSection = sections.get("education") || "";
  if (eduSection) {
    userData.education = eduSection
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" — ")
      .slice(0, 240);
  } else {
    const eduMatch = cleanText.match(
      /(?:education|academics|university|college|qualification)[\s:]*([^\n\r]+(?:\n[^\n\r]+){0,2})/i,
    );
    if (eduMatch) userData.education = eduMatch[1].replace(/\n+/g, " ").trim().slice(0, 240);
  }

  const contextEntries: Array<Omit<ContextEntry, "id" | "timestamp">> = [];
  const experienceText =
    sections.get("experience") ||
    sections.get("work experience") ||
    sections.get("employment") ||
    "";
  if (!userData.currentRole && experienceText) {
    const maybeRole = experienceText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .find((l) => looksLikeRole(l));
    if (maybeRole) userData.currentRole = maybeRole.slice(0, 80);
  }
  const projectText = sections.get("projects") || sections.get("project") || "";
  const aboutText = sections.get("about") || sections.get("summary") || "";

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
      description: aboutText.replace(/\n+/g, " ").slice(0, 500),
      category: "experience",
      skills: extractedSkills.slice(0, 6),
      impact: "",
    });
  }

  if (contextEntries.length === 0 && cleanText.length > 50) {
    contextEntries.push({
      title: userData.currentRole || "Professional Overview",
      description: cleanText.slice(0, 450),
      category: "experience",
      skills: [...extractedSkills],
      impact: "",
    });
  }

  return {
    userData,
    contextEntries: contextEntries.slice(0, 8),
    extractedSkills,
    rawTextPreview: cleanText.slice(0, 300),
    source: isLinkedIn ? "linkedin" : "resume",
  };
}

/** Dispatcher used by the Options import UI. */
export async function parseImportedFile(file: File): Promise<ExtractionResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await readPdfFile(file);
    if (!text) {
      throw new Error("No text found in PDF. Try a text-based resume or paste the contents.");
    }
    return parseResumeOrLinkedInText(text);
  }

  const text = await file.text();
  if (name.endsWith(".json") || file.type === "application/json" || looksLikeJson(text)) {
    try {
      return parseProfileJson(text);
    } catch {
      throw new Error("Invalid JSON file. Export a FillIt backup or a flat profile object.");
    }
  }

  return parseResumeOrLinkedInText(text);
}
