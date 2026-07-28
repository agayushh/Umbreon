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

export function isRestrictedUrl(url: string | undefined): boolean {
  // Empty/undefined can happen for some chrome tabs before URL resolves —
  // allow attempt; injection will fail cleanly if truly restricted.
  if (!url) return false;
  return RESTRICTED_PREFIXES.some((p) => url.startsWith(p));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve the CRXJS content-script loader path from the live manifest. */
export function getContentScriptFiles(): string[] {
  const scripts = chrome.runtime.getManifest().content_scripts?.[0]?.js;
  return scripts?.length ? [...scripts] : [];
}

/**
 * Resolve the actual ES module for the content script (web-accessible).
 * CRXJS loaders only kick off an async import() and return immediately —
 * awaiting the module import ourselves guarantees the listener is registered.
 */
export function getContentModuleUrl(): string | null {
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
      // Match hashed content bundle, skip the loader
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

/**
 * Ensure the content script is alive in the tab.
 * Injects (and awaits module evaluation) if the ping fails.
 */
export async function ensureContentScript(tabId: number): Promise<void> {
  if (await ping(tabId)) return;

  const moduleUrl = getContentModuleUrl();
  if (moduleUrl) {
    // Inject by awaiting dynamic import — Chrome waits for returned promises.
    // This avoids the CRXJS loader race (loader returns before import finishes).
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: async (url: string) => {
        await import(/* @vite-ignore */ url);
      },
      args: [moduleUrl],
    });
  } else {
    const files = getContentScriptFiles();
    if (!files.length) {
      throw new Error("Could not resolve content script from manifest");
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files,
    });
  }

  // Poll until the listener is ready (module side-effects registered).
  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(50 + attempt * 40);
    if (await ping(tabId)) return;
  }

  throw new Error(
    "Content script failed to load. Refresh the page and try again.",
  );
}

/** Send a message to the tab's content script, injecting first if needed. */
export async function sendToTab<T = unknown>(
  tabId: number,
  message: Record<string, unknown>,
): Promise<T> {
  await ensureContentScript(tabId);
  return (await chrome.tabs.sendMessage(tabId, message)) as T;
}
