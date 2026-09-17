import { localMatcher } from "./localMatcher";
import { detectFormFields } from "./fieldDetector";
import { createLogger } from "./logger";

const log = createLogger("FormFiller");

class FormFiller {
  async initialize(): Promise<void> {
    try {
      await localMatcher.initialize();
      log.info("Initialized successfully");
    } catch (error) {
      log.error("Initialization failed", error);
      throw error;
    }
  }

  async fillForm(): Promise<{
    success: boolean;
    message: string;
    stats?: {
      filled: number;
      total: number;
      errors: string[];
      suggestedProfileUpdates?: Array<{
        key: string;
        label: string;
        value: string;
      }>;
      matches?: Array<{
        value: string;
        confidence: number;
        method: string;
      }>;
      unfilled?: Array<{ label: string; method: string }>;
    };
  }> {
    try {
      await this.initialize();

      const fields = detectFormFields();
      const results = await localMatcher.matchAll(fields);

      if (results.filled === 0) {
        if (results.total > 0) {
          return {
            success: true,
            message: `Detected ${results.total} fields but couldn't auto-fill any. Add more profile data or context entries.`,
            stats: results,
          };
        }
        return { success: false, message: "No forms found on this page" };
      }

      const message = `Successfully filled ${results.filled} out of ${results.total} fields`;
      if (results.errors.length > 0) {
        log.warn("Completed with errors", results.errors);
      }

      return { success: true, message, stats: results };
    } catch (error) {
      log.error("Form filling failed", error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  async fillSingleField(
    fieldIndex: number,
    value: string,
  ): Promise<boolean> {
    try {
      await this.initialize();
      const fields = detectFormFields();
      if (fieldIndex < 0 || fieldIndex >= fields.length) return false;

      localMatcher.fillElement(fields[fieldIndex], value);

      const field = fields[fieldIndex];
      const label =
        field.label || field.placeholder || field.name || `Field ${fieldIndex}`;
      const contextEntry = {
        id: `user_${Date.now()}`,
        title: label,
        description: value,
        category: "other" as const,
        timestamp: Date.now(),
      };

      try {
        await chrome.runtime.sendMessage({
          action: "saveContextEntry",
          data: contextEntry,
        });
      } catch (err) {
        log.warn("Could not persist context entry via background", err);
      }

      const userData = localMatcher.getUserData();
      const entries = [...(userData.contextEntries || []), contextEntry];
      localMatcher.setUserData({ ...userData, contextEntries: entries });

      return true;
    } catch (e) {
      log.error("fillSingleField error", e);
      return false;
    }
  }

  async detectForms(): Promise<{
    count: number;
    fields: Array<{
      type: string;
      name: string;
      label: string;
      placeholder: string;
      required: boolean;
    }>;
  }> {
    try {
      await this.initialize();

      const fields = detectFormFields();
      return {
        count: fields.length,
        fields: fields.map((f) => ({
          type: f.type,
          name: f.name,
          label: f.label,
          placeholder: f.placeholder,
          required: f.required,
        })),
      };
    } catch (error) {
      log.error("Form detection failed", error);
      return { count: 0, fields: [] };
    }
  }
}

export const formFiller = new FormFiller();
