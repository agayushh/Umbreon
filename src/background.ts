import { formHistoryService } from "./formHistory";
import { createLogger } from "./logger";

const log = createLogger("Background");

log.info("Background service worker loaded");

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
  if (msg.action === "getLearnedData" || msg.action === "getLearnedHistory") {
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

  // Import learned history from JSON backup
  if (msg.action === "importLearnedData") {
    formHistoryService
      .importLearnedData(msg.data)
      .then((count) => {
        sendResponse({ success: true, count });
      })
      .catch((err) => {
        log.error("Failed to import learned data", err);
        sendResponse({ success: false, count: 0 });
      });
    return true;
  }

  // ── Context Entry Handlers ─────────────────────────────────────────

  // Save a context entry
  if (msg.action === "saveContextEntry") {
    formHistoryService
      .saveContextEntry(msg.data)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        log.error("Failed to save context entry", err);
        sendResponse({ success: false });
      });
    return true;
  }

  // Get all context entries
  if (msg.action === "getContextEntries") {
    formHistoryService
      .getContextEntries()
      .then((entries) => {
        sendResponse({ success: true, data: entries });
      })
      .catch((err) => {
        log.error("Failed to get context entries", err);
        sendResponse({ success: false, data: [] });
      });
    return true;
  }

  // Delete a context entry
  if (msg.action === "deleteContextEntry") {
    formHistoryService
      .deleteContextEntry(msg.data.id)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        log.error("Failed to delete context entry", err);
        sendResponse({ success: false });
      });
    return true;
  }

  // Clear all context entries
  if (msg.action === "clearContextEntries") {
    formHistoryService
      .clearContextEntries()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        log.error("Failed to clear context entries", err);
        sendResponse({ success: false });
      });
    return true;
  }
});
