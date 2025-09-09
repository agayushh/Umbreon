import { aiService } from './aiService';

class FormFiller {
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await aiService.initialize();
      this.isInitialized = true;
      console.log('FormFiller initialized successfully');
    } catch (error) {
      console.error('Failed to initialize FormFiller:', error);
      throw error;
    }
  }

  async fillForm(): Promise<{ success: boolean; message: string; stats?: { filled: number; total: number; errors: string[] } }> {
    try {
      await this.initialize();
      
      const results = await aiService.fillForm();
      
      if (results.filled === 0) {
        if (results.total > 0) {
          return {
            success: true,
            message: `Detected ${results.total} fields but couldn't auto-fill. Try adding more profile data or retry if rate-limited.`,
            stats: results
          };
        }
        return {
          success: false,
          message: 'No forms found on this page'
        };
      }

      const message = `Successfully filled ${results.filled} out of ${results.total} fields`;
      
      if (results.errors.length > 0) {
        console.warn('Form filling completed with errors:', results.errors);
      }

      return {
        success: true,
        message,
        stats: results
      };
    } catch (error) {
      console.error('Form filling failed:', error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async detectForms(): Promise<{ count: number; fields: Array<{ type: string; name: string; label: string; placeholder: string; required: boolean }> }> {
    try {
      console.log('FormFiller: Starting form detection...');
      await this.initialize();
      console.log('FormFiller: Initialization complete, detecting fields...');
      
      const fields = aiService.detectFormFields();
      console.log('FormFiller: Detected fields:', fields);
      
      const result = {
        count: fields.length,
        fields: fields.map(field => ({
          type: field.type,
          name: field.name,
          label: field.label,
          placeholder: field.placeholder,
          required: field.required
        }))
      };
      
      console.log('FormFiller: Returning result:', result);
      return result;
    } catch (error) {
      console.error('FormFiller: Form detection failed:', error);
      return { count: 0, fields: [] };
    }
  }

  async updateUserData(data: Record<string, unknown>): Promise<void> {
    try {
      await this.initialize();
      await aiService.updateUserData(data);
    } catch (error) {
      console.error('Failed to update user data:', error);
      throw error;
    }
  }

  async setApiKey(apiKey: string): Promise<void> {
    try {
      await aiService.setApiKey(apiKey);
    } catch (error) {
      console.error('Failed to set API key:', error);
      throw error;
    }
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
