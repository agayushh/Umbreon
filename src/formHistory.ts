/** Manages learned form data — observed from user submissions. */

import { createLogger } from "./logger";
import type { LearnedEntry, FormHistory, UserData } from "./types";

const log = createLogger("FormHistory");
const STORAGE_KEY = "formHistory";
const MAX_ENTRIES = 500; // cap to avoid storage bloat

class FormHistoryService {
  private history: FormHistory = { entries: [], profileUpdates: {} };
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      if (result[STORAGE_KEY]) {
        this.history = result[STORAGE_KEY] as FormHistory;
      }
      this.initialized = true;
      log.info(`Loaded ${this.history.entries.length} learned entries`);
    } catch (err) {
      log.error("Failed to load form history", err);
    }
  }

  private async persist(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: this.history });
  }

  /** Record values from a submitted form. */
  async recordSubmission(
    domain: string,
    fields: Array<{ label: string; value: string }>,
  ): Promise<void> {
    await this.initialize();

    const now = Date.now();
    for (const { label, value } of fields) {
      if (!label || !value) continue;

      const normalized = label.toLowerCase().trim();

      // Update existing entry for same domain+label or add new
      const existing = this.history.entries.findIndex(
        (e) => e.domain === domain && e.fieldLabel === normalized,
      );

      const entry: LearnedEntry = {
        fieldLabel: normalized,
        value,
        domain,
        timestamp: now,
        source: "submission",
      };

      if (existing >= 0) {
        this.history.entries[existing] = entry;
      } else {
        this.history.entries.push(entry);
      }
    }

    // Trim oldest entries if over cap
    if (this.history.entries.length > MAX_ENTRIES) {
      this.history.entries.sort((a, b) => b.timestamp - a.timestamp);
      this.history.entries = this.history.entries.slice(0, MAX_ENTRIES);
    }

    await this.persist();
    log.info(`Recorded ${fields.length} fields from ${domain}`);
  }

  /** Get learned values for a specific domain. */
  async getLearnedValues(domain: string): Promise<Record<string, string>> {
    await this.initialize();
    const result: Record<string, string> = {};
    for (const entry of this.history.entries) {
      if (entry.domain === domain) {
        result[entry.fieldLabel] = entry.value;
      }
    }
    return result;
  }

  /** Get all learned values across domains (most recent wins). */
  async getAllLearnedValues(): Promise<Record<string, string>> {
    await this.initialize();
    const result: Record<string, string> = {};
    // Sort oldest first so most recent overwrites
    const sorted = [...this.history.entries].sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    for (const entry of sorted) {
      result[entry.fieldLabel] = entry.value;
    }
    return result;
  }

  /** Get entries grouped by domain for display in Options. */
  async getEntriesGroupedByDomain(): Promise<Record<string, LearnedEntry[]>> {
    await this.initialize();
    const grouped: Record<string, LearnedEntry[]> = {};
    for (const entry of this.history.entries) {
      if (!grouped[entry.domain]) grouped[entry.domain] = [];
      grouped[entry.domain].push(entry);
    }
    // Sort each group by most recent first
    for (const domain of Object.keys(grouped)) {
      grouped[domain].sort((a, b) => b.timestamp - a.timestamp);
    }
    return grouped;
  }

  /** Suggest profile updates from learned data. */
  async getProfileSuggestions(): Promise<
    Array<{ key: string; value: string; domain: string }>
  > {
    await this.initialize();
    const result = await chrome.storage.sync.get(["userData"]);
    const userData: UserData = result.userData || {};

    const suggestions: Array<{ key: string; value: string; domain: string }> =
      [];
    const PROFILE_FIELDS: Record<string, RegExp> = {
      name: /\b(name|full\s*name)\b/i,
      email: /\b(email|e-?mail)\b/i,
      phone: /\b(phone|mobile|tel|contact\s*number)\b/i,
      linkedin: /\b(linkedin|linked\s*in)\b/i,
      github: /\bgithub\b/i,
      portfolio: /\b(portfolio|website|personal\s*site)\b/i,
      address: /\baddress\b/i,
      city: /\bcity\b/i,
      state: /\b(state|province)\b/i,
      zipCode: /\b(zip|postal)\b/i,
      country: /\bcountry\b/i,
      salary: /\b(salary|ctc|compensation)\b/i,
      availability: /\b(availability|available|notice\s*period)\b/i,
    };

    for (const entry of this.history.entries) {
      for (const [key, pattern] of Object.entries(PROFILE_FIELDS)) {
        if (pattern.test(entry.fieldLabel) && !userData[key]) {
          suggestions.push({ key, value: entry.value, domain: entry.domain });
          break;
        }
      }
    }
    return suggestions;
  }

  /** Merge selected keys from learned data into the user profile. */
  async mergeToProfile(updates: Record<string, string>): Promise<void> {
    const result = await chrome.storage.sync.get(["userData"]);
    const userData: UserData = result.userData || {};
    const merged = { ...userData, ...updates };
    await chrome.storage.sync.set({ userData: merged });
    log.info("Merged learned data into profile", Object.keys(updates));
  }

  /** Delete a specific entry. */
  async deleteEntry(domain: string, fieldLabel: string): Promise<void> {
    await this.initialize();
    this.history.entries = this.history.entries.filter(
      (e) => !(e.domain === domain && e.fieldLabel === fieldLabel),
    );
    await this.persist();
  }

  /** Clear all learned history. */
  async clearHistory(): Promise<void> {
    this.history = { entries: [], profileUpdates: {} };
    await this.persist();
    log.info("Cleared all form history");
  }

  /** Get total entry count. */
  async getEntryCount(): Promise<number> {
    await this.initialize();
    return this.history.entries.length;
  }
}

export const formHistoryService = new FormHistoryService();
