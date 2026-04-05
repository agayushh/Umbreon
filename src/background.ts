import { formHistoryService } from "./formHistory";
import { createLogger } from "./logger";

const log = createLogger("Background");

log.info("Background service worker loaded");

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Forward cache-clear to content script
  if (msg.action === "clearCache") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "clearCache" });
      }
    });
    sendResponse({ success: true });
    return true;
  }

  // Store learned data from form submissions
  if (msg.action === "formSubmitted") {
    const { domain, fields } = msg.data as {
      domain: string;
      fields: Array<{ label: string; value: string }>;
    };
    formHistoryService
      .recordSubmission(domain, fields)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        log.error("Failed to record submission", err);
        sendResponse({ success: false });
      });
    return true;
  }

  // Get learned data for display
  if (msg.action === "getLearnedData") {
    formHistoryService
      .getEntriesGroupedByDomain()
      .then((grouped) => {
        sendResponse({ success: true, data: grouped });
      })
      .catch((err) => {
        log.error("Failed to get learned data", err);
        sendResponse({ success: false, data: {} });
      });
    return true;
  }

  // Get learning entry count
  if (msg.action === "getLearnedCount") {
    formHistoryService
      .getEntryCount()
      .then((count) => {
        sendResponse({ success: true, count });
      })
      .catch(() => {
        sendResponse({ success: true, count: 0 });
      });
    return true;
  }

  // Get profile suggestions from learned data
  if (msg.action === "getProfileSuggestions") {
    formHistoryService
      .getProfileSuggestions()
      .then((suggestions) => {
        sendResponse({ success: true, suggestions });
      })
      .catch((err) => {
        log.error("Failed to get profile suggestions", err);
        sendResponse({ success: false, suggestions: [] });
      });
    return true;
  }

  // Merge learned data into profile
  if (msg.action === "mergeLearnedToProfile") {
    const updates = msg.data as Record<string, string>;
    formHistoryService
      .mergeToProfile(updates)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        log.error("Failed to merge to profile", err);
        sendResponse({ success: false });
      });
    return true;
  }

  // Delete a single learned entry
  if (msg.action === "deleteLearnedEntry") {
    const { domain, fieldLabel } = msg.data as {
      domain: string;
      fieldLabel: string;
    };
    formHistoryService
      .deleteEntry(domain, fieldLabel)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        log.error("Failed to delete entry", err);
        sendResponse({ success: false });
      });
    return true;
  }

  // Clear all learned history
  if (msg.action === "clearLearnedHistory") {
    formHistoryService
      .clearHistory()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        log.error("Failed to clear history", err);
        sendResponse({ success: false });
      });
    return true;
  }
});
