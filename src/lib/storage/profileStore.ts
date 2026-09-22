/** Multi-profile persistence. Local storage is source of truth (10MB+).
 *  Sync is best-effort so small profiles can follow the user across devices. */

import type { ContextEntry, NamedProfile, ProfileBook, UserData } from "@/shared/types";
import { StorageKey } from "@/shared/storage";

const USER_DATA_KEY = StorageKey.UserData;
const PROFILE_BOOK_KEY = StorageKey.ProfileBook;
const CONTEXT_KEY = StorageKey.ContextEntries;
const MAX_CONTEXT_ENTRIES = 100;

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length > 0
  );
}

function newProfileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultProfileName(userData: UserData): string {
  const first = String(userData.firstName || userData.name || "")
    .trim()
    .split(/\s+/)[0];
  return first ? `${first}'s profile` : "Default";
}

export function createEmptyProfile(name = "Default"): NamedProfile {
  const now = Date.now();
  return {
    id: newProfileId(),
    name: name.trim() || "Untitled",
    userData: {},
    contextEntries: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Drop empty values so imports don't wipe existing profile fields. */
function compactUserData(partial: Partial<UserData>): Partial<UserData> {
  const out: Partial<UserData> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

function mergeLists(a?: string[], b?: string[]): string[] {
  return Array.from(new Set([...(a || []), ...(b || [])]));
}

export function mergeUserDataObjects(
  existing: UserData,
  partial: Partial<UserData>,
): UserData {
  const incoming = compactUserData(partial);
  const merged: UserData = { ...existing, ...incoming };

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

  return merged;
}

async function readLegacyUserData(): Promise<UserData> {
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

async function readLegacyContext(): Promise<ContextEntry[]> {
  try {
    const result = await chrome.storage.local.get([CONTEXT_KEY]);
    const entries = result[CONTEXT_KEY];
    return Array.isArray(entries) ? (entries as ContextEntry[]) : [];
  } catch {
    return [];
  }
}

function isProfileBook(value: unknown): value is ProfileBook {
  if (!value || typeof value !== "object") return false;
  const book = value as ProfileBook;
  return Array.isArray(book.profiles) && book.profiles.length > 0 && Boolean(book.activeId);
}

async function persistBook(book: ProfileBook): Promise<void> {
  const active = book.profiles.find((p) => p.id === book.activeId) || book.profiles[0];
  await chrome.storage.local.set({
    [PROFILE_BOOK_KEY]: book,
    [USER_DATA_KEY]: active?.userData || {},
    [CONTEXT_KEY]: active?.contextEntries || [],
  });
  try {
    await chrome.storage.sync.set({ [USER_DATA_KEY]: active?.userData || {} });
  } catch {
    // Sync quota is 8KB/item — resume-sized profiles stay local-only.
  }
}

export async function loadProfileBook(): Promise<ProfileBook> {
  try {
    const local = await chrome.storage.local.get([PROFILE_BOOK_KEY]);
    if (isProfileBook(local[PROFILE_BOOK_KEY])) {
      const book = local[PROFILE_BOOK_KEY] as ProfileBook;
      if (!book.profiles.some((p) => p.id === book.activeId)) {
        book.activeId = book.profiles[0].id;
        await persistBook(book);
      }
      return book;
    }
  } catch {
    /* migrate below */
  }

  const userData = await readLegacyUserData();
  const contextEntries = await readLegacyContext();
  const profile = createEmptyProfile(defaultProfileName(userData));
  profile.userData = userData;
  profile.contextEntries = contextEntries;
  const book: ProfileBook = {
    version: 1,
    activeId: profile.id,
    profiles: [profile],
  };
  await persistBook(book);
  return book;
}

export async function saveProfileBook(book: ProfileBook): Promise<void> {
  const normalized: ProfileBook = {
    version: 1,
    activeId: book.activeId,
    profiles: book.profiles.map((p) => ({
      ...p,
      name: p.name.trim() || "Untitled",
      userData: p.userData || {},
      contextEntries: Array.isArray(p.contextEntries) ? p.contextEntries : [],
    })),
  };
  if (!normalized.profiles.some((p) => p.id === normalized.activeId)) {
    normalized.activeId = normalized.profiles[0]?.id || createEmptyProfile().id;
  }
  if (normalized.profiles.length === 0) {
    const empty = createEmptyProfile();
    normalized.profiles = [empty];
    normalized.activeId = empty.id;
  }
  await persistBook(normalized);
}

function activeFrom(book: ProfileBook): NamedProfile {
  return book.profiles.find((p) => p.id === book.activeId) || book.profiles[0];
}

export async function listProfiles(): Promise<NamedProfile[]> {
  const book = await loadProfileBook();
  return book.profiles;
}

export async function getActiveProfile(): Promise<NamedProfile> {
  const book = await loadProfileBook();
  return activeFrom(book);
}

export async function loadUserData(): Promise<UserData> {
  const profile = await getActiveProfile();
  return profile.userData || {};
}

export async function saveUserData(userData: UserData): Promise<void> {
  const book = await loadProfileBook();
  const now = Date.now();
  book.profiles = book.profiles.map((p) =>
    p.id === book.activeId ? { ...p, userData, updatedAt: now } : p,
  );
  await persistBook(book);
}

export async function mergeUserData(partial: Partial<UserData>): Promise<UserData> {
  const existing = await loadUserData();
  const merged = mergeUserDataObjects(existing, partial);
  await saveUserData(merged);
  return merged;
}

export async function setActiveProfile(id: string): Promise<NamedProfile> {
  const book = await loadProfileBook();
  if (!book.profiles.some((p) => p.id === id)) {
    return activeFrom(book);
  }
  book.activeId = id;
  await persistBook(book);
  return activeFrom(book);
}

export async function createProfile(name?: string): Promise<NamedProfile> {
  const book = await loadProfileBook();
  const profile = createEmptyProfile(name || `Profile ${book.profiles.length + 1}`);
  book.profiles.push(profile);
  book.activeId = profile.id;
  await persistBook(book);
  return profile;
}

export async function renameProfile(id: string, name: string): Promise<NamedProfile | null> {
  const book = await loadProfileBook();
  const trimmed = name.trim();
  if (!trimmed) return book.profiles.find((p) => p.id === id) || null;
  book.profiles = book.profiles.map((p) =>
    p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
  );
  await persistBook(book);
  return book.profiles.find((p) => p.id === id) || null;
}

export async function deleteProfile(id: string): Promise<ProfileBook> {
  const book = await loadProfileBook();
  if (book.profiles.length <= 1) return book;
  book.profiles = book.profiles.filter((p) => p.id !== id);
  if (book.activeId === id) {
    book.activeId = book.profiles[0].id;
  }
  await persistBook(book);
  return book;
}

export async function replaceProfiles(
  profiles: NamedProfile[],
  activeId?: string,
): Promise<ProfileBook> {
  const next = (profiles.length ? profiles : [createEmptyProfile()]).map((p) => ({
    id: p.id || newProfileId(),
    name: (p.name || defaultProfileName(p.userData || {})).trim() || "Untitled",
    userData: p.userData || {},
    contextEntries: Array.isArray(p.contextEntries) ? p.contextEntries : [],
    createdAt: p.createdAt || Date.now(),
    updatedAt: Date.now(),
  }));
  const book: ProfileBook = {
    version: 1,
    activeId: activeId && next.some((p) => p.id === activeId) ? activeId : next[0].id,
    profiles: next,
  };
  await persistBook(book);
  return book;
}

export async function getActiveContextEntries(): Promise<ContextEntry[]> {
  const profile = await getActiveProfile();
  return profile.contextEntries || [];
}

export async function saveContextEntry(entry: ContextEntry): Promise<void> {
  const book = await loadProfileBook();
  const now = Date.now();
  book.profiles = book.profiles.map((p) => {
    if (p.id !== book.activeId) return p;
    const entries = [...(p.contextEntries || [])];
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) entries[idx] = entry;
    else entries.push(entry);
    if (entries.length > MAX_CONTEXT_ENTRIES) {
      entries.sort((a, b) => b.timestamp - a.timestamp);
      entries.length = MAX_CONTEXT_ENTRIES;
    }
    return { ...p, contextEntries: entries, updatedAt: now };
  });
  await persistBook(book);
}

export async function deleteContextEntry(id: string): Promise<void> {
  const book = await loadProfileBook();
  const now = Date.now();
  book.profiles = book.profiles.map((p) => {
    if (p.id !== book.activeId) return p;
    return {
      ...p,
      contextEntries: (p.contextEntries || []).filter((e) => e.id !== id),
      updatedAt: now,
    };
  });
  await persistBook(book);
}
