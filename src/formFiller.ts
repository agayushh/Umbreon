import { aiService } from "./aiService";
import { createLogger } from "./logger";

const log = createLogger("FormFiller");

class FormFiller {
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await aiService.initialize();
      this.isInitialized = true;
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
    };
  }> {
    try {
      await this.initialize();

      const results = await aiService.fillForm();

      if (results.filled === 0) {
        if (results.total > 0) {
          return {
            success: true,
            message: `Detected ${results.total} fields but couldn't auto-fill. Try adding more profile data or retry if rate-limited.`,
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

      const fields = aiService.detectFormFields();
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

  async updateUserData(data: Record<string, unknown>): Promise<void> {
    await this.initialize();
    await aiService.updateUserData(data);
  }

  async setApiKey(apiKey: string): Promise<void> {
    await aiService.setApiKey(apiKey);
  }

  getUserData() {
    return aiService.getUserData();
  }

  getCacheStats(): { size: number; keys: string[] } {
    return aiService.getCacheStats();
  }

  clearCache() {
    aiService.clearCache();
  }
}

export const formFiller = new FormFiller();
