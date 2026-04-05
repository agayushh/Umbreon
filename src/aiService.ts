import { SYSTEM_PROMPT } from "./prompts";
import { createLogger } from "./logger";
import { detectFormFields } from "./fieldDetector";
import { formHistoryService } from "./formHistory";
import type { UserData, FormField, FillResult } from "./types";

const log = createLogger("AIService");

/** Fetch timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 15_000;

// ── Synonym table used for label → profile key mapping ──────────────

const SYNONYMS: Record<string, string[]> = {
  name: [
    "name",
    "full name",
    "your name",
    "applicant name",
    "first name",
    "last name",
  ],
  email: ["email", "e-mail", "mail id", "email address"],
  phone: [
    "phone",
    "mobile",
    "mobile number",
    "cell",
    "cellphone",
    "contact number",
    "whatsapp number",
    "telephone",
    "tel",
  ],
  address: ["address", "street", "home address", "line address"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  zipCode: ["zip", "zipcode", "postal code", "pin code", "pincode"],
  country: ["country", "nation"],
  dateOfBirth: ["dob", "date of birth", "birth date", "birthday"],
  linkedin: ["linkedin", "linked in"],
  github: ["github", "git hub"],
  portfolio: [
    "portfolio",
    "website",
    "site url",
    "personal site",
    "portfolio url",
  ],
  experience: ["experience", "work experience", "professional experience"],
  education: ["education", "qualification", "degree", "academics"],
  skills: ["skills", "skillset", "technical skills"],
  salary: ["salary", "ctc", "compensation", "expected salary"],
  availability: ["availability", "available from", "notice period", "join"],
  relocation: ["relocation", "willing to relocate", "move city"],
};

const SUBJECTIVE_KEYWORDS = [
  "why",
  "what",
  "how",
  "describe",
  "explain",
  "tell us",
  "interest",
  "motivation",
  "passion",
  "goal",
  "objective",
  "strength",
  "weakness",
  "challenge",
  "experience",
  "story",
  "example",
  "situation",
];

const PROFILE_KEY_PATTERNS: Array<[RegExp, keyof UserData]> = [
  [/email|e-mail|mail/, "email"],
  [/name|full name|first name|last name/, "name"],
  [/phone|mobile|contact number|tel/, "phone"],
  [/linkedin|linked\s*in/, "linkedin"],
  [/github/, "github"],
  [/portfolio|website|url/, "portfolio"],
  [/address/, "address"],
  [/city/, "city"],
  [/state|province/, "state"],
  [/zip|postal/, "zipCode"],
  [/country/, "country"],
  [/availability|available/, "availability"],
  [/salary|ctc|compensation/, "salary"],
];

// ── AIService ────────────────────────────────────────────────────────

class AIService {
  private apiKey: string | null = null;
  private userData: UserData = {};
  private cache: Map<string, string> = new Map();
  private rateLimitedUntilMs: number | null = null;
  private sensitiveKeys: Set<string> = new Set();
  private usageMode: "auto" | "conservative" | "off" = "conservative";

  async initialize(): Promise<void> {
    const result = await chrome.storage.sync.get([
      "openaiApiKey",
      "userData",
      "sensitiveKeys",
      "usageMode",
    ]);
    this.apiKey = result.openaiApiKey || null;
    this.userData = result.userData || {};
    (result.sensitiveKeys || []).forEach((k: string) =>
      this.sensitiveKeys.add(k),
    );
    this.usageMode =
      (result.usageMode as typeof this.usageMode) || "conservative";
    await formHistoryService.initialize();
  }

  // ── Setters / Getters ──────────────────────────────────────────────

  async setApiKey(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    await chrome.storage.sync.set({ openaiApiKey: apiKey });
  }

  async updateUserData(newData: Partial<UserData>): Promise<void> {
    const sanitized: Partial<UserData> = {};
    for (const [k, v] of Object.entries(newData)) {
      if (!this.sensitiveKeys.has(k) && v !== undefined) {
        (sanitized as Record<string, unknown>)[k] = v;
      }
    }
    this.userData = { ...this.userData, ...sanitized };
    await chrome.storage.sync.set({ userData: this.userData });
  }

  async setSensitiveKeys(keys: string[]): Promise<void> {
    this.sensitiveKeys = new Set(keys);
    await chrome.storage.sync.set({
      sensitiveKeys: Array.from(this.sensitiveKeys),
    });
  }

  getSensitiveKeys(): string[] {
    return Array.from(this.sensitiveKeys);
  }

  async setUsageMode(mode: "auto" | "conservative" | "off"): Promise<void> {
    this.usageMode = mode;
    await chrome.storage.sync.set({ usageMode: mode });
  }

  getUsageMode(): "auto" | "conservative" | "off" {
    return this.usageMode;
  }

  getUserData(): UserData {
    return this.userData;
  }

  // ── OpenAI integration ─────────────────────────────────────────────

  private async callOpenAI(prompt: string, cacheKey?: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not set");
    }

    if (this.rateLimitedUntilMs && Date.now() < this.rateLimitedUntilMs) {
      const waitSeconds = Math.ceil(
        (this.rateLimitedUntilMs - Date.now()) / 1000,
      );
      throw new Error(`OpenAI rate limited. Try again in ~${waitSeconds}s`);
    }

    if (cacheKey && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const doFetch = (): Promise<Response> =>
        fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful assistant that fills out forms based on user data. Be concise and professional. Return only the answer without explanations.",
              },
              { role: "user", content: prompt },
            ],
            max_tokens: 120,
            temperature: 0.4,
          }),
          signal: controller.signal,
        });

      let response = await doFetch();

      // Rate limit
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter ? parseInt(retryAfter, 10) || 30 : 30;
        this.rateLimitedUntilMs = Date.now() + seconds * 1000;
        throw new Error("OpenAI rate limited");
      }

      // One retry for transient 5xx
      if (!response.ok && response.status >= 500) {
        await new Promise((r) => setTimeout(r, 500));
        response = await doFetch();
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `OpenAI API error (${response.status}): ${text || response.statusText}`,
        );
      }

      const data = await response.json();
      const answer = data.choices[0].message.content.trim();

      if (cacheKey) this.cache.set(cacheKey, answer);
      return answer;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `OpenAI request timed out after ${FETCH_TIMEOUT_MS / 1000}s`,
        );
      }
      log.error("OpenAI call failed", error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Bulk field generation (single AI call) ─────────────────────────

  async generateValuesForFields(
    fields: FormField[],
  ): Promise<Record<string, string>> {
    const cacheKey = `bulk_${fields.map((f) => f.label || f.placeholder || f.name || f.id).join("|")}`;
    const schemaExample = fields.map((f, idx) => ({
      key: `field_${idx}`,
      label: (
        f.label ||
        f.placeholder ||
        f.name ||
        f.id ||
        `Field ${idx + 1}`
      ).slice(0, 80),
      type: f.type.slice(0, 30),
    }));

    // Get learned history for this domain
    const domain = new URL(location.href).hostname;
    const learnedValues = await formHistoryService.getLearnedValues(domain);
    const allLearned = await formHistoryService.getAllLearnedValues();

    const prompt = SYSTEM_PROMPT.replace(
      "{{form_fields}}",
      JSON.stringify(schemaExample, null, 2),
    )
      .replace("{{user_data}}", JSON.stringify(this.userData, null, 2))
      .replace("{{website_url}}", location.href)
      .replace(
        "{{learned_history}}",
        JSON.stringify(
          { domainSpecific: learnedValues, general: allLearned },
          null,
          2,
        ),
      );

    const json = await this.callOpenAI(prompt, cacheKey);
    try {
      return JSON.parse(json) as Record<string, string>;
    } catch {
      const match = json.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          log.warn(
            "Failed to parse extracted JSON, falling back to per-field calls",
          );
        }
      }
      // Fallback: per-field calls
      const result: Record<string, string> = {};
      for (let i = 0; i < fields.length; i++) {
        result[`field_${i}`] = await this.getFieldValue(fields[i]);
      }
      return result;
    }
  }

  // ── Field detection (delegates to fieldDetector module) ────────────

  detectFormFields(): FormField[] {
    return detectFormFields();
  }

  // ── Single-field mapping ────────────────────────────────────────────

  private normalizeLabel(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private labelMatchesCategory(label: string, category: string): boolean {
    const norm = this.normalizeLabel(label);
    const words = SYNONYMS[category] || [category];
    return words.some((w) => norm.includes(this.normalizeLabel(w)));
  }

  /**
   * Try to map a field to a profile value without calling the AI.
   * Also checks learned history.
   */
  private async mapFieldToProfile(field: FormField): Promise<string> {
    const fieldText = this.normalizeLabel(
      `${field.label} ${field.placeholder} ${field.name} ${field.id}`,
    );

    // Direct profile mapping
    const mappingOrder: Array<[string, string | undefined]> = [
      ["name", this.userData.name],
      ["email", this.userData.email],
      ["phone", this.userData.phone],
      ["address", this.userData.address],
      ["city", this.userData.city],
      ["state", this.userData.state],
      ["zipCode", this.userData.zipCode],
      ["country", this.userData.country],
      ["dateOfBirth", this.userData.dateOfBirth],
      ["linkedin", this.userData.linkedin],
      ["github", this.userData.github],
      ["portfolio", this.userData.portfolio],
      ["experience", this.userData.experience],
      ["education", this.userData.education],
      ["skills", this.userData.skills?.join(", ")],
      ["salary", this.userData.salary],
      ["availability", this.userData.availability],
    ];

    for (const [key, value] of mappingOrder) {
      if (!value) continue;
      if (this.labelMatchesCategory(fieldText, key)) return value;
    }

    if (this.labelMatchesCategory(fieldText, "relocation")) {
      return this.userData.relocation ? "Yes" : "No";
    }

    if (fieldText.includes("time") && fieldText.includes("interview")) {
      return (
        this.userData.availability ||
        "I am flexible and available during business hours"
      );
    }

    // Check learned history
    try {
      const domain = new URL(location.href).hostname;
      const learnedValues = await formHistoryService.getLearnedValues(domain);
      const normalizedLabel = this.normalizeLabel(
        field.label || field.placeholder || field.name,
      );
      if (learnedValues[normalizedLabel]) {
        log.debug(`Using learned value for "${normalizedLabel}"`);
        return learnedValues[normalizedLabel];
      }
      // Check cross-domain learned values
      const allLearned = await formHistoryService.getAllLearnedValues();
      if (allLearned[normalizedLabel]) {
        log.debug(`Using cross-domain learned value for "${normalizedLabel}"`);
        return allLearned[normalizedLabel];
      }
    } catch {
      // formHistory may fail in non-extension contexts — ignore
    }

    return "";
  }

  /** Determine the best value for a single field, using AI only when needed. */
  async getFieldValue(field: FormField): Promise<string> {
    const mapped = await this.mapFieldToProfile(field);
    if (mapped) return mapped;

    const fieldText = this.normalizeLabel(
      `${field.label} ${field.placeholder} ${field.name} ${field.id}`,
    );

    if (this.isSubjectiveQuestion(fieldText)) {
      return this.generateSubjectiveAnswer(fieldText, field);
    }

    return this.inferFieldValue(fieldText);
  }

  private isSubjectiveQuestion(text: string): boolean {
    return SUBJECTIVE_KEYWORDS.some((kw) => text.includes(kw));
  }

  private async generateSubjectiveAnswer(
    fieldText: string,
    field: FormField,
  ): Promise<string> {
    const cacheKey = `subjective_${fieldText}`;
    const prompt = `Based on this form field: "${field.label || field.placeholder || field.name}"

Context: ${fieldText}

User profile:
- Name: ${this.userData.name || "Not provided"}
- Skills: ${this.userData.skills?.join(", ") || "Not provided"}
- Experience: ${this.userData.experience || "Not provided"}
- Education: ${this.userData.education || "Not provided"}

Generate a professional, concise answer (max 2-3 sentences) that would be appropriate for this field.`;
    return this.callOpenAI(prompt, cacheKey);
  }

  private async inferFieldValue(fieldText: string): Promise<string> {
    const cacheKey = `infer_${fieldText}`;
    const prompt = `Based on this form field context: "${fieldText}"

User data available:
${JSON.stringify(this.userData, null, 2)}

What would be the most appropriate value to fill in this field? Return only the value, no explanation.`;
    return this.callOpenAI(prompt, cacheKey);
  }

  // ── Main form filling ──────────────────────────────────────────────

  async fillForm(): Promise<FillResult> {
    const fields = this.detectFormFields();
    const results: FillResult = {
      filled: 0,
      total: fields.length,
      errors: [],
      suggestedProfileUpdates: [],
    };

    // Decide AI strategy based on usage mode
    let bulkValues: Record<string, string> | null = null;
    if (this.usageMode === "auto") {
      try {
        bulkValues = await this.generateValuesForFields(fields);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.toLowerCase().includes("rate limited")) {
          results.errors.push(
            "OpenAI rate limited. Please wait and try again.",
          );
          return results;
        }
        log.warn(
          "Bulk generation failed, falling back to conservative path",
          e,
        );
      }
    }

    const learned: Array<{ key: string; label: string; value: string }> = [];

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      try {
        let value = "";

        if (
          bulkValues &&
          Object.prototype.hasOwnProperty.call(bulkValues, `field_${i}`)
        ) {
          value = bulkValues[`field_${i}`];
        } else {
          const mapped = await this.mapFieldToProfile(field);
          if (mapped) {
            value = mapped;
          } else if (this.usageMode === "conservative") {
            const label = this.normalizeLabel(
              `${field.label} ${field.placeholder} ${field.name}`,
            );
            value = this.isSubjectiveQuestion(label)
              ? await this.generateSubjectiveAnswer(label, field)
              : "";
          } else if (this.usageMode === "auto") {
            value = await this.getFieldValue(field);
          }
          // 'off' mode: value stays ''
        }

        if (value) {
          this.fillElement(field, value);
          results.filled++;

          // Track potential profile updates
          const label = (
            field.label ||
            field.placeholder ||
            field.name ||
            ""
          ).toLowerCase();
          const inferredKey = this.inferProfileKeyFromLabel(label);
          if (
            inferredKey &&
            !(inferredKey in this.userData) &&
            !this.sensitiveKeys.has(String(inferredKey))
          ) {
            learned.push({
              key: String(inferredKey),
              label: String(inferredKey),
              value,
            });
          }
        }
      } catch (error) {
        results.errors.push(
          `Error filling ${field.label || field.name}: ${error}`,
        );
      }
    }

    results.suggestedProfileUpdates = learned;
    return results;
  }

  /** Write a value into a form element and dispatch change events. */
  private fillElement(field: FormField, value: string): void {
    if (field.element.tagName === "SELECT") {
      const select = field.element as HTMLSelectElement;
      const normalizedValue = value.trim().toLowerCase();
      const option = Array.from(select.options).find(
        (opt) =>
          opt.value.trim().toLowerCase() === normalizedValue ||
          opt.text.trim().toLowerCase() === normalizedValue ||
          opt.value.trim().toLowerCase().includes(normalizedValue) ||
          opt.text.trim().toLowerCase().includes(normalizedValue),
      );
      if (option) select.value = option.value;
    } else if (
      (field.element as HTMLElement).getAttribute("contenteditable") ===
        "true" ||
      (field.element as HTMLElement).getAttribute("role") === "textbox"
    ) {
      (field.element as HTMLElement).textContent = value;
    } else {
      (field.element as HTMLInputElement | HTMLTextAreaElement).value = value;
    }

    field.element.dispatchEvent(new Event("input", { bubbles: true }));
    field.element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  private inferProfileKeyFromLabel(label: string): keyof UserData | null {
    for (const [rx, key] of PROFILE_KEY_PATTERNS) {
      if (rx.test(label)) return key;
    }
    return null;
  }

  // ── Cache management ───────────────────────────────────────────────

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; keys: string[] } {
    return { size: this.cache.size, keys: Array.from(this.cache.keys()) };
  }
}

export const aiService = new AIService();
export type { UserData, FormField };
