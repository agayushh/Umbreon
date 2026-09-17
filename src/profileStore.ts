/** User profile persistence. Local storage is source of truth (10MB+).
 *  Sync is best-effort so small profiles can follow the user across devices. */

import type { UserData } from "./types";

const USER_DATA_KEY = "userData";

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length > 0
  );
}

/** Drop empty values so imports don't wipe existing profile fields. */
export function compactUserData(partial: Partial<UserData>): Partial<UserData> {
  const out: Partial<UserData> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export async function loadUserData(): Promise<UserData> {
  try {
    const local = await chrome.storage.local.get([USER_DATA_KEY]);
    if (isNonEmptyObject(local[USER_DATA_KEY])) {
      return local[USER_DATA_KEY] as UserData;
    }
  } catch {
    /* ignore */
  }

  try {
    const sync = await chrome.storage.sync.get([USER_DATA_KEY]);
    return (sync[USER_DATA_KEY] as UserData) || {};
  } catch {
    return {};
  }
}

export async function saveUserData(userData: UserData): Promise<void> {
  await chrome.storage.local.set({ [USER_DATA_KEY]: userData });
  try {
    await chrome.storage.sync.set({ [USER_DATA_KEY]: userData });
  } catch {
    // Sync quota is 8KB/item — resume-sized profiles stay local-only.
  }
}

export async function mergeUserData(partial: Partial<UserData>): Promise<UserData> {
  const existing = await loadUserData();
  const incoming = compactUserData(partial);
  const merged: UserData = { ...existing, ...incoming };

  const mergeLists = (a?: string[], b?: string[]) =>
    Array.from(new Set([...(a || []), ...(b || [])]));

  if (existing.skills || incoming.skills) {
    merged.skills = mergeLists(existing.skills, incoming.skills);
  }
  if (existing.certifications || incoming.certifications) {
    merged.certifications = mergeLists(existing.certifications, incoming.certifications);
  }
  if (existing.previousCompanies || incoming.previousCompanies) {
    merged.previousCompanies = mergeLists(
      existing.previousCompanies,
      incoming.previousCompanies,
    );
  }
  if (existing.languages || incoming.languages) {
    merged.languages = mergeLists(existing.languages, incoming.languages);
  }

  await saveUserData(merged);
  return merged;
}
