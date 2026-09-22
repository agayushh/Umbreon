import { formHistoryService } from "@/lib/storage/formHistory";
import { mergeUserData } from "@/lib/storage/profileStore";
import { createLogger } from "@/shared/logger";

const log = createLogger("Background");

log.info("Background service worker loaded");

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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

  if (msg.action === "mergeLearnedToProfile") {
    const updates = msg.data as Record<string, string>;
    mergeUserData(updates)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        log.error("Failed to merge to profile", err);
        sendResponse({ success: false });
      });
    return true;
  }

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
});
