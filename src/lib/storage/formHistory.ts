/** Manages learned form data and context entries — observed from user submissions. */

import { createLogger } from "@/shared/logger";
import type { LearnedEntry, FormHistory, ContextEntry } from "@/shared/types";
import { StorageKey } from "@/shared/storage";
import {
  deleteContextEntry as deleteActiveContextEntry,
  getActiveContextEntries,
  saveContextEntry as saveActiveContextEntry,
} from "./profileStore";

const log = createLogger("FormHistory");
const STORAGE_KEY = StorageKey.FormHistory;
const MAX_ENTRIES = 500;

class FormHistoryService {
  private history: FormHistory = { entries: [] };
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      if (result[STORAGE_KEY]) {
        this.history = result[STORAGE_KEY] as FormHistory;
      }
      this.initialized = true;
      log.debug(`Loaded ${this.history.entries.length} learned entries`);
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
    log.debug(`Recorded ${fields.length} fields from ${domain}`);
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
    this.history = { entries: [] };
    await this.persist();
    log.debug("Cleared all form history");
  }

  /** Import learned entries from a JSON backup (grouped by domain or flat list). */
  async importLearnedData(
    data: Record<string, LearnedEntry[]> | { entries?: LearnedEntry[] },
  ): Promise<number> {
    await this.initialize();
    let imported = 0;

    const push = async (domain: string, fieldLabel: string, value: string) => {
      if (!domain || !fieldLabel || !value) return;
      await this.recordSubmission(domain, [
        { label: fieldLabel, value },
      ]);
      imported++;
    };

    if ("entries" in data && Array.isArray(data.entries)) {
      for (const entry of data.entries) {
        await push(entry.domain, entry.fieldLabel, entry.value);
      }
      return imported;
    }

    for (const [domain, entries] of Object.entries(data)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        await push(entry.domain || domain, entry.fieldLabel, entry.value);
      }
    }
    return imported;
  }

  /** Get total entry count. */
  async getEntryCount(): Promise<number> {
    await this.initialize();
    return this.history.entries.length;
  }

  // ── Context Entry Management (active profile) ───────────────────────

  async getContextEntries(): Promise<ContextEntry[]> {
    return getActiveContextEntries();
  }

  async saveContextEntry(entry: ContextEntry): Promise<void> {
    await saveActiveContextEntry(entry);
    log.debug(`Saved context entry: ${entry.title}`);
  }

  async deleteContextEntry(id: string): Promise<void> {
    await deleteActiveContextEntry(id);
    log.debug(`Deleted context entry: ${id}`);
  }
}

export const formHistoryService = new FormHistoryService();
