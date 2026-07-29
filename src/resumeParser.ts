/**
 * Resume and LinkedIn Profile Parser Engine for FillIt.
 * Extracts structured profile fields and context memory entries from plain text,
 * raw LinkedIn profile text/exports, and resume text (including PDF files).
 */

import * as pdfjsLib from "pdfjs-dist";
import type { UserData, ContextEntry } from "./types";

// Configure worker URL for PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ExtractionResult {
  userData: Partial<UserData>;
  contextEntries: Array<Omit<ContextEntry, "id" | "timestamp">>;
  extractedSkills: string[];
  rawTextPreview: string;
}

/** Extract plain text from PDF resume file. */
export async function readPdfFile(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let text = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      text += pageText + "\n";
    }

    return text.trim();
  } catch (error) {
    console.error("[FillIt] PDF reading error:", error);
    throw new Error(
      "Failed to read PDF file. Please ensure it is a valid text-based PDF resume.",
    );
  }
}

/** Extract structured profile and context memory from text. */
export function parseResumeOrLinkedInText(text: string): ExtractionResult {
  const cleanText = text.trim();
  const lines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);

  const userData: Partial<UserData> = {};
  const contextEntries: Array<Omit<ContextEntry, "id" | "timestamp">> = [];
  const extractedSkills: string[] = [];

  // 1. Email
  const emailMatch = cleanText.match(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  );
  if (emailMatch) {
    userData.email = emailMatch[0];
  }

  // 2. Phone Number
  const phoneMatch = cleanText.match(
    /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
  );
  if (phoneMatch) {
    userData.phone = phoneMatch[0];
  }

  // 3. URLs (LinkedIn, GitHub, Portfolio)
  const linkedinMatch = cleanText.match(
    /https?:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/i,
  );
  if (linkedinMatch) {
    userData.linkedin = linkedinMatch[0];
  }

  const githubMatch = cleanText.match(
    /https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_-]+/i,
  );
  if (githubMatch) {
    userData.github = githubMatch[0];
  }

  const portfolioMatch = cleanText.match(
    /https?:\/\/(?!www\.linkedin|github)[A-Za-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?/i,
  );
  if (portfolioMatch) {
    userData.portfolio = portfolioMatch[0];
  }

  // 4. Full Name / First Name / Last Name
  // Heuristic: Check top 5 lines for a human name (excluding email/phone/urls)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (
      line.includes("@") ||
      line.includes("http") ||
      /\d/.test(line) ||
      line.length > 40
    ) {
      continue;
    }
    const words = line.split(/\s+/).filter((w) => /^[A-Za-z.-]+$/.test(w));
    if (words.length >= 2 && words.length <= 4) {
      userData.name = words.join(" ");
      userData.firstName = words[0];
      userData.lastName = words.slice(1).join(" ");
      break;
    }
  }

  // 5. Address / Location (City, State, Country)
  const locationMatch = cleanText.match(
    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z]{2}|[A-Z][a-z]+)\b/,
  );
  if (locationMatch) {
    userData.city = locationMatch[1];
    userData.state = locationMatch[2];
  }

  // 6. Skills Section
  const skillsRegex =
    /(?:skills|technical skills|technologies|expertise|competencies|tools)[\s:]*([^\n\r]+(?:\n[^\n\r]+){0,4})/i;
  const skillsMatch = cleanText.match(skillsRegex);
  if (skillsMatch) {
    const rawSkills = skillsMatch[1];
    const items = rawSkills
      .split(/[,•|\/\n\t]+/)
      .map((s) => s.replace(/^[-•*]\s*/, "").trim())
      .filter((s) => s.length >= 2 && s.length <= 30 && !/experience|education|project/i.test(s));

    items.forEach((skill) => {
      if (!extractedSkills.includes(skill)) {
        extractedSkills.push(skill);
      }
    });
    userData.skills = extractedSkills;
  }

  // 7. Experience / Role Summary
  const expMatch = cleanText.match(
    /(\d+)\+?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:experience|exp)?/i,
  );
  if (expMatch) {
    userData.yearsOfExperience = expMatch[1] + "+ years";
  }

  const titleRegex =
    /(?:current role|title|position|designation|headline)[\s:]*([^\n\r]+)/i;
  const titleMatch = cleanText.match(titleRegex);
  if (titleMatch) {
    userData.currentRole = titleMatch[1].trim();
  }

  // 8. Education Section
  const eduRegex =
    /(?:education|academics|university|college|qualification)[\s:]*([^\n\r]+(?:\n[^\n\r]+){0,2})/i;
  const eduMatch = cleanText.match(eduRegex);
  if (eduMatch) {
    userData.education = eduMatch[1].replace(/\n+/g, " ").trim();
  }

  // 9. Context Memory Extraction (Projects & Work Achievements)
  // Split sections by headings or bullet blocks
  const sections = cleanText.split(/\n(?=[A-Z0-9\s]{3,25}:|\n[A-Z][a-z]+\s+(?:Experience|Project|Summary|About|History))/);

  sections.forEach((section) => {
    const secLines = section.trim().split("\n").filter(Boolean);
    if (secLines.length === 0) return;

    const title = secLines[0].replace(/[:\-]/g, "").trim();
    if (
      /skills|contact|address|personal|header|info/i.test(title) ||
      title.length > 60
    ) {
      return;
    }

    const body = secLines.slice(1).join(" ").trim();
    if (body.length < 20) return;

    let category: ContextEntry["category"] = "project";
    if (/experience|work|job|employment|engineer|developer|manager/i.test(title + " " + body)) {
      category = "experience";
    } else if (/lead|leadership|founder|president|captain/i.test(title + " " + body)) {
      category = "leadership";
    } else if (/education|degree|thesis/i.test(title + " " + body)) {
      category = "education";
    } else if (/certif|award|honor|license/i.test(title + " " + body)) {
      category = "certification";
    }

    contextEntries.push({
      title: title.slice(0, 80),
      description: body.slice(0, 500),
      category,
      skills: extractedSkills.slice(0, 5),
      impact: "",
    });
  });

  // If no sections were found, create a general context summary
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
  };
}
