import { formHistoryService } from "@/lib/storage/formHistory";
import { mergeUserData } from "@/lib/storage/profileStore";
import { createLogger } from "@/shared/logger";
import { Action } from "@/shared/messages";

const log = createLogger("Background");

log.info("Background service worker loaded");

type RuntimeMessage = { action?: string; data?: unknown };

const handlers: Record<
  string,
  (msg: RuntimeMessage) => Promise<Record<string, unknown>>
> = {
  [Action.FormSubmitted]: async (msg) => {
    const { domain, fields } = msg.data as {
      domain: string;
      fields: Array<{ label: string; value: string }>;
    };
    await formHistoryService.recordSubmission(domain, fields);
    return { success: true };
  },

  [Action.GetLearnedData]: async () => {
    try {
      const data = await formHistoryService.getEntriesGroupedByDomain();
      return { success: true, data };
    } catch (err) {
      log.error("Failed to get learned data", err);
      return { success: false, data: {} };
    }
  },

  [Action.GetLearnedCount]: async () => {
    try {
      const count = await formHistoryService.getEntryCount();
      return { success: true, count };
    } catch {
      return { success: true, count: 0 };
    }
  },

  [Action.MergeLearnedToProfile]: async (msg) => {
    await mergeUserData(msg.data as Record<string, string>);
    return { success: true };
  },

  [Action.DeleteLearnedEntry]: async (msg) => {
    const { domain, fieldLabel } = msg.data as {
      domain: string;
      fieldLabel: string;
    };
    await formHistoryService.deleteEntry(domain, fieldLabel);
    return { success: true };
  },

  [Action.ClearLearnedHistory]: async () => {
    await formHistoryService.clearHistory();
    return { success: true };
  },

  [Action.ImportLearnedData]: async (msg) => {
    const count = await formHistoryService.importLearnedData(msg.data as never);
    return { success: true, count };
  },

  [Action.SaveContextEntry]: async (msg) => {
    await formHistoryService.saveContextEntry(msg.data as never);
    return { success: true };
  },

  [Action.GetContextEntries]: async () => {
    try {
      const data = await formHistoryService.getContextEntries();
      return { success: true, data };
    } catch (err) {
      log.error("Failed to get context entries", err);
      return { success: false, data: [] };
    }
  },

  [Action.DeleteContextEntry]: async (msg) => {
    const { id } = msg.data as { id: string };
    await formHistoryService.deleteContextEntry(id);
    return { success: true };
  },
};

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  const handler = msg.action ? handlers[msg.action] : undefined;
  if (!handler) return false;

  handler(msg)
    .then(sendResponse)
    .catch((err) => {
      log.error(`Handler failed for ${msg.action}`, err);
      sendResponse({ success: false });
    });
  return true;
});
