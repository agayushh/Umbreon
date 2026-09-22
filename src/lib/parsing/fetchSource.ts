/** Fetch a LinkedIn profile or public portfolio for import. Runs in the background worker. */

import { assertImportableUrl, type SourceKind } from "./sourceUrl";

const MAX_CHARS = 1_500_000;
const AUTH_WALL =
  /sign in|join now|authwall|join linkedin|ready to join|session redirect/i;

export interface FetchedSource {
  text: string;
  url: string;
  kind: SourceKind;
  contentType: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lookLikeAuthWall(text: string): boolean {
  const sample = text.slice(0, 2000);
  return AUTH_WALL.test(sample) && !/\d+\+?\s*connections?/i.test(sample);
}

async function waitForTabComplete(tabId: number, timeoutMs = 25000): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Timed out waiting for the page to load."));
    }, timeoutMs);

    const onUpdated = (id: number, info: { status?: string }) => {
      if (id !== tabId || info.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function scrapeTab(tabId: number): Promise<{ text: string; html: string }> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const jsonLd = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      )
        .map((node) => node.textContent || "")
        .join("\n");
      const html = document.documentElement?.outerHTML || "";
      const text = document.body?.innerText || "";
      return { jsonLd, html: html.slice(0, 1_200_000), text };
    },
  });
  const html = result?.html || "";
  const jsonLd = result?.jsonLd ? `\n<script type="application/ld+json">${result.jsonLd}</script>\n` : "";
  const text = result?.text || "";
  return { text, html: jsonLd + html + (text ? `\n${text}` : "") };
}

async function findExistingTab(url: string): Promise<chrome.tabs.Tab | undefined> {
  const target = new URL(url);
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => {
    if (!tab.id || !tab.url) return false;
    try {
      const current = new URL(tab.url);
      return (
        current.hostname.replace(/^www\./, "") === target.hostname.replace(/^www\./, "") &&
        current.pathname.replace(/\/$/, "") === target.pathname.replace(/\/$/, "")
      );
    } catch {
      return false;
    }
  });
}

async function scrapeInTab(url: string, kind: SourceKind): Promise<string> {
  const existing = await findExistingTab(url);
  let tabId = existing?.id;
  let created = false;

  if (!tabId) {
    const createdTab = await chrome.tabs.create({ url, active: false });
    if (!createdTab.id) throw new Error("Could not open the profile page.");
    tabId = createdTab.id;
    created = true;
  }

  try {
    await waitForTabComplete(tabId);
    if (kind === "linkedin") await sleep(2500);
    else await sleep(800);
    const scraped = await scrapeTab(tabId);
    const combined = `${scraped.html}\n${scraped.text}`.slice(0, MAX_CHARS);
    if (kind === "linkedin" && lookLikeAuthWall(scraped.text)) {
      throw new Error(
        "LinkedIn asked for a login. Open the profile in a tab while signed in, then import again.",
      );
    }
    if (scraped.text.trim().length < 40 && scraped.html.length < 200) {
      throw new Error("That page did not return enough profile text to parse.");
    }
    return combined;
  } finally {
    if (created && tabId) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        /* tab already gone */
      }
    }
  }
}

async function fetchRemote(url: string): Promise<{ text: string; contentType: string }> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { Accept: "text/html, application/json, text/markdown, text/plain;q=0.8" },
  });
  if (!response.ok) {
    throw new Error(`Could not fetch that URL (${response.status}).`);
  }
  const contentType = response.headers.get("content-type") || "";
  const text = (await response.text()).slice(0, MAX_CHARS);
  if (!text.trim()) throw new Error("That URL returned an empty page.");
  return { text, contentType };
}

/** Load LinkedIn (via the user's session tab) or a public portfolio/JSON/Markdown page. */
export async function fetchProfileSource(rawUrl: string): Promise<FetchedSource> {
  const { url, kind } = assertImportableUrl(rawUrl);

  if (kind === "linkedin") {
    const text = await scrapeInTab(url, kind);
    return { text, url, kind, contentType: "text/html" };
  }

  try {
    const remote = await fetchRemote(url);
    if (lookLikeAuthWall(remote.text)) {
      const scraped = await scrapeInTab(url, kind);
      return { text: scraped, url, kind, contentType: remote.contentType || "text/html" };
    }
    return { text: remote.text, url, kind, contentType: remote.contentType };
  } catch (error) {
    try {
      const scraped = await scrapeInTab(url, kind);
      return { text: scraped, url, kind, contentType: "text/html" };
    } catch {
      throw error instanceof Error ? error : new Error("Could not fetch that URL.");
    }
  }
}
