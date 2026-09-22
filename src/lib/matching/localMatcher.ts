/** Core intelligence engine — exhaustive matching pipeline for form filling. */

import { detectFormContext } from "@/lib/detection/contextDetector";
import { formHistoryService } from "@/lib/storage/formHistory";
import { loadUserData } from "@/lib/storage/profileStore";
import type {
  UserData,
  FormField,
  FormContext,
  FieldMatch,
  FillResult,
  ContextEntry,
} from "@/shared/types";
import { createLogger } from "@/shared/logger";
import { getTransformersPipeline } from "./transformersEnv";
import { StorageKey } from "@/shared/storage";
import { fillField } from "./fill";
import {
  AUTOCOMPLETE_KEY,
  PROFILE_KEY_PATTERNS,
  SENSITIVE_PATTERNS,
  SUBJECTIVE_KEYWORDS,
  SYNONYMS,
} from "./lexicon";
import { jaccard, levenshteinRatio, normalize, tokenize } from "./text";

const log = createLogger("LocalMatcher");

class LocalMatcher {
  private userData: UserData = {};
  private surveyMode = false;
  /**
   * Optional ONNX models (MiniLM + Flan-T5). OFF by default — loading them
   * inside a content script downloads tens/hundreds of MB and floods
   * chrome://extensions with WASM graph warnings that look like hard errors.
   * Synonym + fuzzy + templates already handle most forms well.
   */
  private enableLocalModels = false;
  private modelReady = false;
  private embeddingPipeline: unknown = null;
  private generatorPipeline: unknown = null;
  private generatorReady = false;
  /** Sticky fail so we don't re-download / re-spam console on every field. */
  private generatorFailed = false;
  private profileEmbeddings: Map<string, number[]> = new Map();
  private contextEmbeddings: Map<string, number[]> = new Map();

  async initialize(): Promise<void> {
    this.userData = await loadUserData();
    const result = await chrome.storage.sync.get([
      StorageKey.SurveyMode,
      StorageKey.EnableLocalModels,
    ]);
    this.surveyMode = result[StorageKey.SurveyMode] || false;
    this.enableLocalModels = result[StorageKey.EnableLocalModels] === true;

    await formHistoryService.initialize();

    // Load context entries from local storage and merge into userData
    try {
      const contextEntries = await formHistoryService.getContextEntries();
      if (contextEntries.length > 0) {
        this.userData = {
          ...this.userData,
          contextEntries,
        };
      }
    } catch {
      // formHistory may fail — that's okay
    }

    // Only warm MiniLM when the user explicitly enabled local models
    if (this.enableLocalModels && Object.keys(this.userData).length > 0) {
      this.warmUpModel();
    }
  }

  setUserData(data: UserData): void {
    this.userData = data;
    this.profileEmbeddings.clear();
    this.contextEmbeddings.clear();
    if (this.enableLocalModels && Object.keys(data).length > 0) {
      this.warmUpModel();
    }
  }

  getUserData(): UserData {
    return this.userData;
  }

  setSurveyMode(enabled: boolean): void {
    this.surveyMode = enabled;
  }

  // ── Model loading ──────────────────────────────────────────────────

  private async warmUpModel(): Promise<void> {
    if (!this.enableLocalModels) return;
    if (this.modelReady || this.embeddingPipeline !== null) return;

    this.embeddingPipeline = "loading";

    try {
      const pipeline = await getTransformersPipeline();
      const extractor = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        {
          quantized: true,
          progress_callback: undefined,
        },
      );
      this.embeddingPipeline = extractor;
      this.modelReady = true;
      log.info("MiniLM model loaded successfully");

      await this.preComputeEmbeddings();
    } catch (err) {
      log.warn(
        "Failed to load MiniLM model, using synonym+fuzzy only",
        this.summarizeModelError(err),
      );
      this.embeddingPipeline = null;
      this.modelReady = false;
    }
  }

  /**
   * Optional text generator for subjective questions. Only runs when
   * enableLocalModels is on. Sticky-fails after one error to avoid spam.
   */
  private async ensureGenerator(): Promise<void> {
    if (!this.enableLocalModels) return;
    if (this.generatorReady || this.generatorFailed) return;
    if (this.generatorPipeline === "loading") return;

    this.generatorPipeline = "loading";
    try {
      const pipeline = await getTransformersPipeline();
      const generator = await pipeline(
        "text2text-generation",
        "Xenova/flan-t5-small",
        { quantized: true },
      );
      this.generatorPipeline = generator;
      this.generatorReady = true;
      log.info("Flan-T5-small generator model loaded");
    } catch (err) {
      this.generatorFailed = true;
      this.generatorPipeline = null;
      this.generatorReady = false;
      log.warn(
        "Local generator unavailable — using templates / prompt user instead",
        this.summarizeModelError(err),
      );
    }
  }

  /** Turn opaque fetch/JSON errors into something readable in DevTools. */
  private summarizeModelError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (/DOCTYPE|Unexpected token\s*['"]?</i.test(msg)) {
      return (
        "Model download returned HTML instead of JSON (blocked URL, " +
        "wrong origin, or Hugging Face error page). " +
        "Falling back to non-ML matching. Detail: " +
        msg.slice(0, 120)
      );
    }
    return msg;
  }

  private async preComputeEmbeddings(): Promise<void> {
    if (!this.modelReady) return;

    const displayNames: Record<string, string> = {
      name: "full name first name last name applicant name",
      email: "email address electronic mail e-mail",
      phone: "phone number mobile telephone cell",
      address: "street address home address mailing address",
      city: "city town municipality",
      state: "state province region territory",
      zipCode: "zip code postal code pin code",
      country: "country nation residence",
      dateOfBirth: "date of birth birthday age",
      gender: "gender sex male female",
      nationality: "nationality citizenship",
      currentRole: "current role job title position designation",
      yearsOfExperience: "years of experience work experience total experience",
      education: "education qualification degree university college",
      skills: "skills skillset expertise competencies",
      certifications: "certifications certificates professional certifications",
      linkedin: "linkedin profile linkedin url",
      github: "github profile github url",
      portfolio: "portfolio website personal site",
      salary: "salary ctc compensation expected salary annual income",
      relocation: "relocation willing to relocate move",
      availability: "availability notice period start date join",
      workType: "work type remote hybrid onsite",
      languages: "languages spoken language proficiency",
    };

    for (const [key, value] of Object.entries(this.userData)) {
      if (value === undefined || value === null) continue;
      if (key === "contextEntries") continue;
      if (key === "skills") continue;
      if (key === "certifications") continue;
      if (key === "previousCompanies") continue;

      const text = displayNames[key] || key;
      try {
        const emb = await this.computeEmbedding(text);
        this.profileEmbeddings.set(key, emb);
      } catch {
        // ignore individual embedding failures
      }
    }

    // Pre-compute context entry embeddings
    const contextEntries = (this.userData.contextEntries ||
      []) as ContextEntry[];
    for (const entry of contextEntries) {
      try {
        const emb = await this.computeEmbedding(
          `${entry.title}. ${entry.description}`,
        );
        this.contextEmbeddings.set(entry.id, emb);
      } catch {
        // ignore
      }
    }
  }

  private async computeEmbedding(text: string): Promise<number[]> {
    if (!this.modelReady || !this.embeddingPipeline) {
      throw new Error("Model not ready");
    }

    const output = await (
      this.embeddingPipeline as {
        (
          text: string,
          options: { pooling: string; normalize: boolean },
        ): Promise<{
          data: Float32Array;
        }>;
      }
    )(text, { pooling: "mean", normalize: true });

    return Array.from(output.data);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  // ── Exhaustive matching pipeline ───────────────────────────────────

  async matchField(
    field: FormField,
    formContext: FormContext,
  ): Promise<FieldMatch> {
    // Use human-readable label only — joining entry.123 IDs breaks exact matches
    // and lets fuzzy wrongly map every "*name*" field to firstName.
    const autocompleteMatch = this.matchAutocomplete(field);
    if (autocompleteMatch) return autocompleteMatch;

    const matchText = this.getMatchText(field);

    if (!matchText) {
      return { value: "", confidence: 0, method: "none" };
    }

    const normalizedLabel = normalize(matchText);

    // Check sensitive fields — NEVER auto-fill
    if (this.isSensitive(normalizedLabel)) {
      return { value: "", confidence: 0, method: "none" };
    }

    // Step 0: Name bifurcation (first / last / full) — must run before fuzzy
    // so "name" never steals firstName and "last name" never gets first token.
    const nameRole = this.classifyNameRole(normalizedLabel);
    if (nameRole) {
      const value = this.resolveNameValue(nameRole);
      if (value) {
        return { value, confidence: 0.98, method: "synonym" };
      }
    }

    // Step 1: Exact synonym match
    const exactMatch = this.exactSynonymMatch(normalizedLabel);
    if (exactMatch && exactMatch.confidence > 0.8) return exactMatch;

    // Step 2: Fuzzy matching (Jaccard + Levenshtein)
    const fuzzyMatch = await this.fuzzyMatch(normalizedLabel);
    if (fuzzyMatch && fuzzyMatch.confidence > 0.55) return fuzzyMatch;

    // Step 3: Semantic cosine similarity
    const cosineMatch = await this.cosineMatch(normalizedLabel);
    if (cosineMatch && cosineMatch.confidence > 0.4) return cosineMatch;

    // Step 4: Subjective / open-ended?
    if (this.isSubjective(normalizedLabel)) {
      const contextMatch = await this.retrieveBestContext(normalizedLabel);
      if (contextMatch) {
        return this.generateAnswerFromContext(normalizedLabel, contextMatch);
      }

      const templateResult = this.generateFromTemplate(normalizedLabel);
      if (templateResult.value) return templateResult;

      // Optional local generator (off by default — see enableLocalModels)
      if (this.enableLocalModels) {
        const generated = await this.generateWithLocalModel(normalizedLabel);
        if (generated) {
          return { value: generated, confidence: 0.5, method: "generated" };
        }
      }

      if (formContext.type !== "survey" && !this.surveyMode) {
        return { value: "", confidence: 0, method: "prompted" };
      }
    }

    // Step 5: Survey mode fallback
    if (formContext.type === "survey" || this.surveyMode) {
      return this.generateSurveyAnswer(field);
    }

    return { value: "", confidence: 0, method: "none" };
  }

  /**
   * Use the local Flan-T5 generator to produce a contextually appropriate
   * answer to a subjective question. Falls back to null if the model
   * isn't ready, fails to load, or produces empty output.
   */
  private async generateWithLocalModel(
    questionLabel: string,
  ): Promise<string | null> {
    if (!this.enableLocalModels) return null;
    // Skip entirely after a permanent failure (e.g. HF returned HTML)
    if (this.generatorFailed) return null;

    if (!this.generatorReady && this.generatorPipeline === null) {
      // Kick off load but only wait briefly — 250MB downloads block fills
      void this.ensureGenerator();
      await Promise.race([
        new Promise<void>((resolve) => {
          const check = () => {
            if (this.generatorReady || this.generatorFailed) resolve();
            else if (this.generatorPipeline !== "loading") resolve();
            else setTimeout(check, 100);
          };
          check();
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
      if (!this.generatorReady) return null;
    }

    if (!this.generatorReady || !this.generatorPipeline) return null;

    // Build a concise prompt with profile context. Flan-T5 works best with
    // short, instruction-style prompts.
    const profileContext = this.buildProfileContextSummary();
    const prompt = `Answer this form question based on the user's profile. Be specific and concise. Keep it under 60 words.

Question: ${questionLabel}

Profile: ${profileContext}

Answer:`;

    try {
      const result = await (
        this.generatorPipeline as {
          (
            text: string,
            options: { max_new_tokens: number },
          ): Promise<Array<{ generated_text: string }>>;
        }
      )(prompt, { max_new_tokens: 80 });
      const text = result?.[0]?.generated_text?.trim();
      return text && text.length > 5 ? text : null;
    } catch (err) {
      log.warn("Local model generation failed", err);
      return null;
    }
  }

  /** Build a one-paragraph summary of user profile for the generative prompt. */
  private buildProfileContextSummary(): string {
    const u = this.userData;
    const parts: string[] = [];
    if (u.name) parts.push(`Name: ${u.name}`);
    if (u.currentRole) parts.push(`Role: ${u.currentRole}`);
    if (u.yearsOfExperience) parts.push(`Experience: ${u.yearsOfExperience} years`);
    if (u.skills?.length) parts.push(`Skills: ${u.skills.join(", ")}`);
    if (u.education) parts.push(`Education: ${u.education}`);
    if (u.city) parts.push(`Location: ${u.city}, ${u.country || ""}`);
    if (u.salary) parts.push(`Salary: ${u.salary}`);
    if (u.availability) parts.push(`Availability: ${u.availability}`);
    return parts.join(". ") + ".";
  }

  /** Coerce profile values (arrays, booleans) into fillable strings. */
  private formatProfileValue(key: string, value: unknown): string {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    // Derive first/last from full name when those keys are empty
    if (
      (value === undefined || value === null || value === "") &&
      (key === "firstName" || key === "lastName")
    ) {
      return this.resolveNameValue(key === "firstName" ? "first" : "last");
    }
    if (key === "name" && (value === undefined || value === null || value === "")) {
      return this.resolveNameValue("full");
    }
    return value == null ? "" : String(value);
  }

  /**
   * Split profile name into first / last / full.
   * Profile "Ayush Goyal" → first=Ayush, last=Goyal, full=Ayush Goyal
   * Explicit firstName/lastName fields win when set.
   */
  private resolveNameValue(role: "first" | "last" | "full"): string {
    const full = String(this.userData.name ?? "").trim();
    const explicitFirst = String(this.userData.firstName ?? "").trim();
    const explicitLast = String(this.userData.lastName ?? "").trim();
    const parts = full.split(/\s+/).filter(Boolean);
    const derivedFirst = parts[0] || "";
    const derivedLast = parts.length > 1 ? parts.slice(1).join(" ") : "";

    if (role === "first") return explicitFirst || derivedFirst;
    if (role === "last") return explicitLast || derivedLast;
    if (full) return full;
    return [explicitFirst || derivedFirst, explicitLast || derivedLast]
      .filter(Boolean)
      .join(" ");
  }

  /**
   * Classify a field label as first / last / full name.
   * Specific roles (first/last) must win over bare "name".
   */
  private classifyNameRole(
    normalizedLabel: string,
  ): "first" | "last" | "full" | null {
    const t = normalizedLabel;
    // Reject non-person name fields
    if (
      /\b(user\s*name|username|company|business|school|file|brand|product|pet|org)\b/.test(
        t,
      )
    ) {
      return null;
    }

    const isFirst =
      /\b(first\s*name|given\s*name|forename|f\s*name|fname)\b/.test(t) ||
      (/\bfirst\b/.test(t) && /\bname\b/.test(t));
    const isLast =
      /\b(last\s*name|surname|family\s*name|l\s*name|lname|second\s*name)\b/.test(
        t,
      ) ||
      (/\b(last|surname|family)\b/.test(t) && /\bname\b/.test(t));

    if (isFirst && !isLast) return "first";
    if (isLast && !isFirst) return "last";
    if (isFirst && isLast) return "full"; // "first and last name" → full

    if (
      /\b(full\s*name|legal\s*name|complete\s*name|applicant\s*name|your\s*name)\b/.test(
        t,
      )
    ) {
      return "full";
    }

    // Bare "name" only — not "middle name", not "name of school"
    if (t === "name" || t === "the name" || t === "name name") return "full";

    if (
      /\bname\b/.test(t) &&
      !/\b(middle|maiden|nick|preferred|display|user|file|company)\b/.test(t)
    ) {
      // e.g. "name *" or "name (required)" after normalize
      const stripped = t
        .replace(/\b(required|optional|please|enter|your)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (stripped === "name" || stripped === "the name") return "full";
    }

    return null;
  }

  /** Map HTML autocomplete tokens (given-name, email, ...) straight to profile keys. */
  private matchAutocomplete(field: FormField): FieldMatch | null {
    const raw = (field.autocomplete || "").trim().toLowerCase();
    if (!raw || raw === "off" || raw === "on") return null;
    const token = raw.split(/\s+/).pop() || "";
    const key = AUTOCOMPLETE_KEY[token];
    if (!key) return null;
    const value = this.formatProfileValue(String(key), this.userData[key]);
    if (!value) return null;
    return { value, confidence: 0.97, method: "synonym" };
  }

  private humanizeIdentifier(value: string): string {
    return value
      .replace(/\[\]$/g, "")
      .replace(/^[A-Za-z0-9_]+\[([A-Za-z0-9_]+)\]$/, "$1")
      .replace(/[._-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim();
  }

  /** Drop Google Forms entry.123 / uuid-like tokens & generic placeholders like "Your answer" that break exact matching. */
  private getMatchText(field: FormField): string {
    const isMachine = (s: string) =>
      /entry\.\d+/i.test(s) ||
      /^[\d._-]+$/.test(s) ||
      /^[a-f0-9]{8,}$/i.test(s) ||
      (/^[a-z0-9]+([._-][a-z0-9]+){2,}$/i.test(s) && !/\s/.test(s));

    const isGenericPlaceholder = (s: string) =>
      /^(your answer|type here|enter text|type your answer|your response|short answer text|long answer text|answer|text|input|enter value)$/i.test(
        s.trim(),
      );

    const candidates = [
      field.label,
      field.placeholder,
      this.humanizeIdentifier(field.name || ""),
      this.humanizeIdentifier(field.id || ""),
    ]
      .map((s) => (s || "").trim())
      .filter(Boolean);

    for (const text of candidates) {
      if (!isMachine(text) && !isGenericPlaceholder(text)) return text;
    }

    return candidates.join(" ").trim();
  }

  // ── Step 1: Exact synonym match ────────────────────────────────────

  private exactSynonymMatch(normalizedLabel: string): FieldMatch | null {
    const labelTokens = tokenize(normalizedLabel);

    // Reject overly long labels — they're questions, not field labels
    if (labelTokens.size > 6) return null;

    // Direct match: label is exactly a synonym
    for (const [key, synonyms] of Object.entries(SYNONYMS)) {
      let value = this.userData[key];
      // Allow first/last derivation from full name
      if (
        (value === undefined || value === null || value === "") &&
        (key === "firstName" || key === "lastName")
      ) {
        value = this.formatProfileValue(key, value);
        if (!value) continue;
      } else if (value === undefined || value === null) {
        continue;
      }

      for (const syn of synonyms) {
        const normSyn = normalize(syn);
        if (normalizedLabel === normSyn) {
          const formatted = this.formatProfileValue(key, value);
          if (!formatted) continue;
          return {
            value: formatted,
            confidence: 0.95,
            method: "synonym",
          };
        }
      }
    }

    // Check if one of the profile key words is in the label
    for (const [key, value] of Object.entries(this.userData)) {
      if (value === undefined || value === null) continue;
      if (
        key === "skills" ||
        key === "certifications" ||
        key === "previousCompanies"
      )
        continue;
      if (key === "contextEntries" || key === "relocation") continue;

      const normKey = normalize(key);
      if (normalizedLabel === normKey) {
        const formatted = this.formatProfileValue(key, value);
        if (!formatted) continue;
        return {
          value: formatted,
          confidence: 0.9,
          method: "synonym",
        };
      }
    }

    return null;
  }

  // ── Step 2: Fuzzy matching ─────────────────────────────────────────

  private async fuzzyMatch(
    normalizedLabel: string,
  ): Promise<FieldMatch | null> {
    const labelTokens = tokenize(normalizedLabel);
    let bestScore = 0;
    let bestValue = "";

    // Reject overly long labels — they're likely questions, not field labels
    // E.g. "explain about yourself" or "describe a project you are proud of"
    if (labelTokens.size > 6) return null;

    // If this label is a name field, name role handler already ran — do not
    // let fuzzy re-map first/last/full via shared token "name".
    if (this.classifyNameRole(normalizedLabel)) {
      return null;
    }

    for (const [key, synonyms] of Object.entries(SYNONYMS)) {
      // Never fuzzy-match name parts here; prevents "name"→firstName bleed
      if (key === "firstName" || key === "lastName" || key === "name") continue;

      const value = this.formatProfileValue(key, this.userData[key]);
      if (!value) continue;

      for (const syn of synonyms) {
        const normSyn = normalize(syn);
        const synTokens = tokenize(normSyn);

        const jScore = jaccard(labelTokens, synTokens);
        const lScore = levenshteinRatio(normalizedLabel, normSyn);

        // Count meaningful token overlaps (len >= 3). A single shared common
        // word like "work" must not alone promote a weak match (e.g. mapping
        // "work type preference" → yearsOfExperience via "work experience").
        const overlapCount = [...synTokens].filter((w) => {
          if (w.length < 3) return false;
          return [...labelTokens].some((lw) => {
            if (lw.length < 3) return false;
            if (lw === w) return true;
            const shorter = w.length <= lw.length ? w : lw;
            const longer = w.length <= lw.length ? lw : w;
            if (longer.startsWith(shorter)) {
              return shorter.length / longer.length >= 0.8;
            }
            return false;
          });
        }).length;

        const base = jScore * 0.6 + lScore * 0.4;
        // Boost only when ≥2 tokens overlap OR single-token with high Jaccard
        const overlapBoost =
          overlapCount >= 2 ? 0.65 : overlapCount === 1 && jScore >= 0.5 ? 0.6 : 0;
        const combined = Math.max(base, overlapBoost);

        if (combined > bestScore) {
          bestScore = combined;
          bestValue = value;
        }
      }
    }

    // Also check against learned values
    if (bestScore < 0.55) {
      try {
        const domain = location.hostname;
        const learned = await formHistoryService.getLearnedValues(domain);

        for (const [fieldLabel, learnedValue] of Object.entries(learned)) {
          const normLearned = normalize(fieldLabel);
          const jScore = jaccard(labelTokens, tokenize(normLearned));
          const lScore = levenshteinRatio(normalizedLabel, normLearned);
          const combined = jScore * 0.6 + lScore * 0.4;
          if (combined > bestScore) {
            bestScore = combined;
            bestValue = learnedValue;
          }
        }
      } catch {
        // formHistory may fail
      }
    }

    if (bestScore > 0.55 && bestValue) {
      return {
        value: bestValue,
        confidence: bestScore,
        method: "fuzzy",
      };
    }

    // Special: skills as comma-separated
    if (
      this.userData.skills?.length &&
      labelTokens.size <= 4 &&
      (normalizedLabel.includes("skill") ||
        normalizedLabel.includes("expertise") ||
        normalizedLabel.includes("competenc"))
    ) {
      return {
        value: this.userData.skills.join(", "),
        confidence: 0.65,
        method: "fuzzy",
      };
    }

    // Special: relocation boolean
    if (
      labelTokens.size <= 4 &&
      (normalizedLabel.includes("relocat") ||
        normalizedLabel.includes("willing to move"))
    ) {
      if (this.userData.relocation !== undefined) {
        return {
          value: this.userData.relocation ? "Yes" : "No",
          confidence: 0.7,
          method: "fuzzy",
        };
      }
    }

    return null;
  }

  // ── Step 3: Cosine match ───────────────────────────────────────────

  private async cosineMatch(
    normalizedLabel: string,
  ): Promise<FieldMatch | null> {
    if (!this.modelReady || this.profileEmbeddings.size === 0) {
      return null;
    }

    try {
      const labelEmbedding = await this.computeEmbedding(normalizedLabel);
      let bestScore = 0;
      let bestKey = "";

      for (const [key, emb] of this.profileEmbeddings) {
        const score = this.cosineSimilarity(labelEmbedding, emb);
        if (score > bestScore) {
          bestScore = score;
          bestKey = key;
        }
      }

      if (bestScore > 0.4 && bestKey) {
        const value = this.formatProfileValue(bestKey, this.userData[bestKey]);
        if (value) {
          return {
            value,
            confidence: bestScore,
            method: "semantic",
          };
        }
      }

      // Also check learned values across domains
      const allLearned = await formHistoryService.getAllLearnedValues();
      for (const [fieldLabel, learnedValue] of Object.entries(allLearned)) {
        if (this.profileEmbeddings.has(fieldLabel)) continue; // skip if already checked
        // Simple comparison: if the label partly matches any learned label
        if (normalize(fieldLabel).includes(normalizedLabel.slice(0, 10))) {
          return {
            value: learnedValue,
            confidence: 0.45,
            method: "semantic",
          };
        }
      }
    } catch {
      // model error — skip semantic matching
    }

    return null;
  }

  // ── Step 4a: Context retrieval ────────────────────────────────────

  private async retrieveBestContext(
    questionLabel: string,
  ): Promise<ContextEntry | null> {
    const contextEntries = (this.userData.contextEntries ||
      []) as ContextEntry[];
    if (contextEntries.length === 0) return null;

    // Keyword-based first pass (fast)
    const keywords = normalize(questionLabel)
      .split(/\s+/)
      .filter((w) => w.length > 2);

    // Category targeting based on question content
    let targetCategories: Set<ContextEntry["category"]> = new Set();
    if (/leader|manag|team\s*(lead|head)|supervis/i.test(questionLabel)) {
      targetCategories = new Set(["leadership", "experience"]);
    } else if (
      /project|built|developed|created|implement/i.test(questionLabel)
    ) {
      targetCategories = new Set(["project"]);
    } else if (/achiev|proud|accomplish|success/i.test(questionLabel)) {
      targetCategories = new Set(["achievement"]);
    } else if (
      /challenge|difficult|problem|overcome|fail/i.test(questionLabel)
    ) {
      targetCategories = new Set(["project", "experience"]);
    } else if (
      /education|degree|college|university|study/i.test(questionLabel)
    ) {
      targetCategories = new Set(["education", "certification"]);
    }

    // Score by keyword overlap
    const scored = contextEntries.map((entry) => {
      const entryText = normalize(`${entry.title} ${entry.description}`);
      const entryTokens = new Set(entryText.split(/\s+/));
      const keywordOverlap = keywords.filter((w) => entryTokens.has(w)).length;

      let categoryBonus = 0;
      if (targetCategories.size > 0 && targetCategories.has(entry.category)) {
        categoryBonus = 0.3;
      }

      const score =
        keywordOverlap / Math.max(keywords.length, 1) + categoryBonus;
      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score > 0.1) {
      return scored[0].entry;
    }

    // If model is ready, try semantic matching as fallback
    if (this.modelReady && this.contextEmbeddings.size > 0) {
      try {
        const questionEmb = await this.computeEmbedding(questionLabel);
        let bestScore = 0;
        let bestEntry: ContextEntry | null = null;

        for (const entry of contextEntries) {
          const emb = this.contextEmbeddings.get(entry.id);
          if (!emb) continue;
          const sim = this.cosineSimilarity(questionEmb, emb);
          if (sim > bestScore) {
            bestScore = sim;
            bestEntry = entry;
          }
        }

        if (bestScore > 0.3 && bestEntry) return bestEntry;
      } catch {
        // ignore
      }
    }

    return scored.length > 0 ? scored[0].entry : null;
  }

  // ── Step 4b: Generate answer from context ──────────────────────────

  private generateAnswerFromContext(
    questionLabel: string,
    context: ContextEntry,
  ): FieldMatch {
    const skills =
      this.userData.skills?.slice(0, 3).join(", ") || "various technologies";
    const experience = this.userData.yearsOfExperience || "several years";
    const role = this.userData.currentRole || "professional";

    let answer: string;

    if (/leader|manag|team\s*(lead|head)|supervis/i.test(questionLabel)) {
      answer = `As ${context.title}, I ${context.description.toLowerCase()}. This involved managing responsibilities, coordinating with team members, and ensuring successful outcomes. ${context.impact ? `This led to ${context.impact}.` : ""} This experience strengthened my leadership and communication skills.`;
    } else if (
      /project|built|developed|created|implement/i.test(questionLabel)
    ) {
      answer = `I worked on ${context.title} where ${context.description.toLowerCase()}. This project allowed me to leverage my skills in ${skills} and deliver meaningful results. ${context.impact ? `It resulted in ${context.impact}.` : ""}`;
    } else if (/achiev|proud|accomplish|success/i.test(questionLabel)) {
      answer = `One of my proudest achievements was ${context.title}, where ${context.description.toLowerCase()}. ${context.impact ? `This accomplishment ${context.impact}.` : "This strengthened my confidence and skills."} It demonstrated my ability to deliver impactful results.`;
    } else if (
      /challenge|difficult|problem|overcome|fail/i.test(questionLabel)
    ) {
      answer = `A significant challenge I faced was during ${context.title}. ${context.description}. I overcame this by analyzing the root cause, breaking it down into manageable steps, and collaborating with the team. ${context.impact ? `The outcome was ${context.impact}.` : "This taught me resilience and creative problem-solving."}`;
    } else if (/why|interest|motivation|drawn/i.test(questionLabel)) {
      answer = `With ${experience} of experience in ${skills}, I'm excited about this opportunity. My background in ${context.title} has prepared me to contribute effectively. I'm passionate about leveraging my skills to create meaningful impact and grow professionally.`;
    } else if (/strength/i.test(questionLabel)) {
      answer = `My key strengths include expertise in ${skills}, problem-solving abilities, and a collaborative work ethic. My experience with ${context.title} demonstrates my ability to deliver quality work consistently. I'm always eager to learn and grow.`;
    } else if (/yourself|about you|background/i.test(questionLabel)) {
      answer = `I'm a ${role} with ${experience} of experience specializing in ${skills}. My background includes ${context.title}, where ${context.description.toLowerCase()}. I'm passionate about continuous learning and delivering high-quality work.`;
    } else {
      // Generic fallback using context
      answer = `Based on my experience with ${context.title}, ${context.description.toLowerCase()}. ${context.impact ? `This resulted in ${context.impact}.` : ""} I bring strong skills in ${skills} and a commitment to excellence.`;
    }

    return {
      value: answer,
      confidence: 0.7,
      method: "context",
    };
  }

  // ── Step 4c: Profile-based template generation ─────────────────────

  private generateFromTemplate(questionLabel: string): FieldMatch {
    const skills =
      this.userData.skills?.slice(0, 3).join(", ") || "various technologies";
    const experience = this.userData.yearsOfExperience || "several years";
    const role = this.userData.currentRole || "professional";

    if (/why|interest|motivation/i.test(questionLabel)) {
      return {
        value: `With ${experience} in ${skills}, I'm excited about this opportunity. I bring a strong work ethic and a passion for delivering quality results. I'm eager to contribute and grow in a challenging role.`,
        confidence: 0.35,
        method: "template",
      };
    }

    if (/strength/i.test(questionLabel)) {
      return {
        value: `My key strengths include ${skills}, problem-solving abilities, and attention to detail. I thrive in collaborative environments and enjoy tackling complex challenges with creative solutions.`,
        confidence: 0.35,
        method: "template",
      };
    }

    if (/weakness|improve|area.*growth/i.test(questionLabel)) {
      return {
        value: `I'm continuously working to deepen my expertise in emerging technologies. I believe there's always room for growth, and I actively seek feedback to improve my skills and approach.`,
        confidence: 0.3,
        method: "template",
      };
    }

    if (/yourself|about you|background/i.test(questionLabel)) {
      return {
        value: `I'm a ${role} with ${experience} of experience, passionate about ${skills}. I have ${this.userData.education || "a strong academic background"} and enjoy working on impactful projects. I'm always eager to learn new things and contribute meaningfully.`,
        confidence: 0.35,
        method: "template",
      };
    }

    if (/goal|aspiration|ambition|career.*plan/i.test(questionLabel)) {
      return {
        value: `My goal is to continue growing as a ${role}, deepening my expertise in ${skills}, and taking on increasingly challenging responsibilities that make a meaningful impact.`,
        confidence: 0.3,
        method: "template",
      };
    }

    if (/teamwork|team.*work|collaborat/i.test(questionLabel)) {
      return {
        value: `I thrive in team environments and believe great results come from effective collaboration. I communicate openly, support my colleagues, and am always willing to go the extra mile to help the team succeed.`,
        confidence: 0.3,
        method: "template",
      };
    }

    return { value: "", confidence: 0, method: "none" };
  }

  // ── Step 5: Survey answer generation ───────────────────────────────

  private generateSurveyAnswer(field: FormField): FieldMatch {
    const el = field.element;

    // MCQ / Radio / Checkbox
    if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "radio") {
      // Find all radio options in the same group
      const name = (el as HTMLInputElement).name;
      const options = document.querySelectorAll<HTMLInputElement>(
        `input[name="${CSS.escape(name)}"]`,
      );
      if (options.length > 1) {
        const idx = Math.floor(Math.random() * options.length);
        return {
          value:
            options[idx].value || options[idx].getAttribute("aria-label") || "",
          confidence: 0.3,
          method: "survey",
        };
      }
      return { value: "", confidence: 0, method: "none" };
    }

    // Select/dropdown
    if (el.tagName === "SELECT") {
      const select = el as HTMLSelectElement;
      const options = Array.from(select.options).filter(
        (o) => o.value && !o.disabled,
      );
      if (options.length > 0) {
        const idx = Math.floor(Math.random() * options.length);
        return {
          value: options[idx].value,
          confidence: 0.3,
          method: "survey",
        };
      }
    }

    // Rating scale (detect by type=range or numeric input)
    if (
      (el as HTMLInputElement).type === "range" ||
      (el as HTMLInputElement).type === "number"
    ) {
      const input = el as HTMLInputElement;
      const min = parseInt(input.min) || 1;
      const max = parseInt(input.max) || 10;
      // Generate a plausible rating (bias toward positive but not perfect)
      const rating = Math.max(min, Math.min(max, Math.floor(max * 0.8)));
      return {
        value: String(rating),
        confidence: 0.3,
        method: "survey",
      };
    }

    // Short text survey fields
    if (
      field.element.tagName === "INPUT" &&
      (field.element as HTMLInputElement).type === "text"
    ) {
      const responses = [
        "No strong preference",
        "Generally satisfied",
        "Open to exploring options",
        "Neutral",
        "Neither agree nor disagree",
      ];
      return {
        value: responses[Math.floor(Math.random() * responses.length)],
        confidence: 0.2,
        method: "survey",
      };
    }

    // Long text survey fields — leave empty unless we have context
    return { value: "", confidence: 0, method: "none" };
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private isSensitive(label: string): boolean {
    return [...SENSITIVE_PATTERNS].some((pattern) =>
      label.includes(normalize(pattern)),
    );
  }

  private isSubjective(label: string): boolean {
    return SUBJECTIVE_KEYWORDS.some((kw) => label.includes(normalize(kw)));
  }

  private inferProfileKeyFromLabel(label: string): keyof UserData | null {
    for (const [rx, key] of PROFILE_KEY_PATTERNS) {
      if (rx.test(label)) return key;
    }
    return null;
  }


  fillElement(field: FormField, value: string): void {
    fillField(field, value);
  }

  async matchAll(fields: FormField[]): Promise<FillResult> {
    try {
      const stored = await loadUserData();
      if (Object.keys(stored).length > 0) {
        this.userData = { ...this.userData, ...stored };
      }
      const syncResult = await chrome.storage.sync.get([
        StorageKey.SurveyMode,
        StorageKey.EnableLocalModels,
      ]);
      if (syncResult[StorageKey.SurveyMode] !== undefined) {
        this.surveyMode = syncResult[StorageKey.SurveyMode];
      }
      if (syncResult[StorageKey.EnableLocalModels] !== undefined) {
        this.enableLocalModels = syncResult[StorageKey.EnableLocalModels] === true;
      }
    } catch {
      // ignore sync errors
    }

    const formContext = detectFormContext();
    log.info(
      `Detected form context: ${formContext.type} (${formContext.confidence.toFixed(2)})`,
    );

    const results: FillResult = {
      filled: 0,
      total: fields.length,
      errors: [],
      suggestedProfileUpdates: [],
      matches: [],
      unfilled: [],
    };

    const learned: Array<{ key: string; label: string; value: string }> = [];

    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
      const field = fields[fieldIndex];
      try {
        const match = await this.matchField(field, formContext);
        match.fieldIndex = fieldIndex;
        const fieldKey =
          field.label ||
          field.placeholder ||
          field.name ||
          `Field ${fieldIndex + 1}`;

        // Fill whenever we have a real value (including survey answers).
        // Skip only "prompted" (user must type) and empty "none".
        if (match.value && match.method !== "prompted") {
          this.fillElement(field, match.value);
          results.filled++;
          results.matches!.push(match);
        } else {
          results.matches!.push(match);
          results.unfilled!.push({
            label: fieldKey,
            method: match.method,
            fieldIndex,
          });
        }

        // Track potential profile updates (only when user manually inputs or generates new values)
        if (
          match.value &&
          match.method !== "none" &&
          match.method !== "prompted" &&
          match.method !== "survey" &&
          match.method !== "context" &&
          match.method !== "synonym"
        ) {
          const label = (
            field.label ||
            field.placeholder ||
            field.name ||
            ""
          ).toLowerCase();
          const inferredKey = this.inferProfileKeyFromLabel(label);
          if (inferredKey && !(inferredKey in this.userData)) {
            learned.push({
              key: String(inferredKey),
              label: String(inferredKey),
              value: match.value,
            });
          }
        }
      } catch (error) {
        results.errors.push(
          `Error filling ${field.label || field.name}: ${error}`,
        );
        results.unfilled!.push({
          label: field.label || field.placeholder || field.name || "Unknown",
          method: "none",
          fieldIndex,
        });
      }
    }

    results.suggestedProfileUpdates = learned;
    return results;
  }
}

export const localMatcher = new LocalMatcher();
