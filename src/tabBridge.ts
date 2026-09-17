/** Reliable popup ↔ content-script messaging for CRXJS async loaders. */

const RESTRICTED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
  "view-source:",
  "chrome-search://",
  "chrome-untrusted://",
  "https://chrome.google.com/webstore",
  "https://chromewebstore.google.com",
];

const FIELD_PROBE_SELECTOR =
  'input:not([type="hidden"]):not([type="password"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]), textarea, select, [contenteditable="true"], [role="textbox"]';

export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return false;
  return RESTRICTED_PREFIXES.some((p) => url.startsWith(p));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve the CRXJS content-script loader path from the live manifest. */
function getContentScriptFiles(): string[] {
  const scripts = chrome.runtime.getManifest().content_scripts?.[0]?.js;
  return scripts?.length ? [...scripts] : [];
}

/**
 * Resolve the actual ES module for the content script (web-accessible).
 * CRXJS loaders only kick off an async import() and return immediately —
 * awaiting the module import ourselves guarantees the listener is registered.
 */
function getContentModuleUrl(): string | null {
  const resources =
    chrome.runtime.getManifest().web_accessible_resources ?? [];
  for (const entry of resources) {
    const files: string[] =
      typeof entry === "object" &&
      entry !== null &&
      "resources" in entry &&
      Array.isArray((entry as { resources?: unknown }).resources)
        ? (entry as { resources: string[] }).resources
        : Array.isArray(entry)
          ? entry
          : [];

    for (const res of files) {
      if (/content\.ts-[^/]+\.js$/.test(res) && !res.includes("loader")) {
        return chrome.runtime.getURL(res);
      }
    }
  }
  return null;
}

async function ping(tabId: number): Promise<boolean> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: "ping" });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

async function injectContentScripts(tabId: number): Promise<void> {
  const moduleUrl = getContentModuleUrl();
  if (moduleUrl) {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "ISOLATED",
      func: async (url: string) => {
        await import(/* @vite-ignore */ url);
      },
      args: [moduleUrl],
    });
    return;
  }

  const files = getContentScriptFiles();
  if (!files.length) {
    throw new Error("Could not resolve content script from manifest");
  }
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files,
  });
}

/**
 * Ensure the content script is alive in the tab.
 * Injects (and awaits module evaluation) if the ping fails.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  if (await ping(tabId)) return;

  await injectContentScripts(tabId);

  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(50 + attempt * 40);
    if (await ping(tabId)) return;
  }

  throw new Error(
    "Content script failed to load. Refresh the page and try again.",
  );
}

async function frameIdsWithFields(tabId: number): Promise<number[]> {
  try {
    const probe = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (selector: string) => {
        try {
          return document.querySelectorAll(selector).length;
        } catch {
          return 0;
        }
      },
      args: [FIELD_PROBE_SELECTOR],
    });
    const ids = probe
      .filter((row) => typeof row.frameId === "number" && Number(row.result) > 0)
      .map((row) => row.frameId as number);
    if (ids.length) return ids;
  } catch {
    /* scripting can fail on restricted frames */
  }
  return [0];
}

type DetectFormsResponse = {
  count: number;
  fields: Array<{
    type: string;
    name: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
};

type FillFormResponse = {
  success: boolean;
  message: string;
  stats?: {
    filled?: number;
    total?: number;
    errors?: string[];
    matches?: Array<{ value: string; confidence: number; method: string }>;
    unfilled?: Array<{ label: string; method: string; fieldIndex: number }>;
    suggestedProfileUpdates?: Array<{ key: string; label: string; value: string }>;
  };
};

async function sendToFrame(
  tabId: number,
  frameId: number,
  message: Record<string, unknown>,
): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message, { frameId });
}

/** Send a message to the tab's content script, injecting first if needed. */
export async function sendToTab<T = unknown>(
  tabId: number,
  message: Record<string, unknown>,
): Promise<T> {
  await ensureContentScript(tabId);

  const action = String(message.action || "");
  if (action === "detectForms" || action === "fillForm" || action === "fillSingleField") {
    const frameIds = await frameIdsWithFields(tabId);

    if (action === "detectForms") {
      const merged: DetectFormsResponse = { count: 0, fields: [] };
      for (const frameId of frameIds) {
        try {
          const res = (await sendToFrame(tabId, frameId, message)) as DetectFormsResponse;
          if (res?.fields?.length) {
            merged.fields.push(...res.fields);
            merged.count += res.count || res.fields.length;
          } else if (res?.count) {
            merged.count += res.count;
          }
        } catch {
          /* frame gone */
        }
      }
      return merged as T;
    }

    if (action === "fillForm") {
      let filled = 0;
      let total = 0;
      const errors: string[] = [];
      const matches: NonNullable<FillFormResponse["stats"]>["matches"] = [];
      const unfilled: NonNullable<FillFormResponse["stats"]>["unfilled"] = [];
      const suggested: NonNullable<FillFormResponse["stats"]>["suggestedProfileUpdates"] = [];
      let anySuccess = false;
      let lastMessage = "No forms found on this page";

      for (const frameId of frameIds) {
        try {
          const res = (await sendToFrame(tabId, frameId, message)) as FillFormResponse;
          if (!res) continue;
          if (res.success) anySuccess = true;
          lastMessage = res.message || lastMessage;
          filled += res.stats?.filled || 0;
          total += res.stats?.total || 0;
          if (res.stats?.errors) errors.push(...res.stats.errors);
          if (res.stats?.matches) matches.push(...res.stats.matches);
          if (res.stats?.unfilled) unfilled.push(...res.stats.unfilled);
          if (res.stats?.suggestedProfileUpdates) {
            suggested.push(...res.stats.suggestedProfileUpdates);
          }
        } catch {
          /* frame gone */
        }
      }

      const success = anySuccess || filled > 0;
      const messageText = total
        ? `Successfully filled ${filled} out of ${total} fields`
        : lastMessage;

      return {
        success,
        message: success ? messageText : lastMessage,
        stats: { filled, total, errors, matches, unfilled, suggestedProfileUpdates: suggested },
      } as T;
    }

    if (action === "fillSingleField") {
      for (const frameId of frameIds) {
        try {
          const res = (await sendToFrame(tabId, frameId, message)) as { success?: boolean };
          if (res?.success) return res as T;
        } catch {
          /* try next frame */
        }
      }
      return { success: false } as T;
    }
  }

  return (await chrome.tabs.sendMessage(tabId, message)) as T;
}
