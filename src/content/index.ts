import { formFiller } from "./filler";
import { observeFormSubmissions } from "./observer";
import { createLogger } from "@/shared/logger";
import { Action } from "@/shared/messages";
import { StorageKey } from "@/shared/storage";

const log = createLogger("Content");

const g = globalThis as typeof globalThis & {
  __fillitListenerRegistered?: boolean;
};

if (!g.__fillitListenerRegistered) {
  g.__fillitListenerRegistered = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === Action.Ping) {
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === Action.FillForm) {
      formFiller
        .fillForm()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          log.error("Fill form error", error);
          sendResponse({
            success: false,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        });
      return true;
    }

    if (message.action === Action.DetectForms) {
      formFiller
        .detectForms()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          log.error("Detect forms error", error);
          sendResponse({ count: 0, fields: [] });
        });
      return true;
    }

    if (message.action === Action.FillSingleField) {
      const { fieldIndex, value } = message.data as {
        fieldIndex: number;
        value: string;
      };
      formFiller
        .fillSingleField(fieldIndex, value)
        .then((success) => {
          sendResponse({ success });
        })
        .catch((error) => {
          log.error("fillSingleField error", error);
          sendResponse({ success: false });
        });
      return true;
    }
  });

  log.debug("Content script message listener ready");
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes[StorageKey.UserData] || changes[StorageKey.ProfileBook] || changes[StorageKey.SurveyMode] || changes[StorageKey.EnableLocalModels]) {
    formFiller.initialize().catch(() => {});
  }
});

formFiller
  .initialize()
  .then(() => {
    log.debug("Form filler initialized");
    observeFormSubmissions();
  })
  .catch((error) => {
    log.error("Failed to initialize form filler", error);
  });
