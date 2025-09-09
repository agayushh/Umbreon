import { SYSTEM_PROMPT } from './prompts';

interface UserData {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  dateOfBirth?: string;
  skills?: string[];
  experience?: string;
  education?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  availability?: string;
  relocation?: boolean;
  salary?: string;
  [key: string]: unknown;
}

interface FormField {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  label: string;
  required: boolean;
}

class AIService {
  private apiKey: string | null = null;
  private userData: UserData = {};
  private cache: Map<string, string> = new Map();
  private rateLimitedUntilMs: number | null = null;
  private sensitiveKeys: Set<string> = new Set();
  private usageMode: 'auto' | 'conservative' | 'off' = 'conservative';

  async initialize(): Promise<void> {
    // Load API key and user data from Chrome storage
    const result = await chrome.storage.sync.get(['openaiApiKey', 'userData', 'sensitiveKeys', 'usageMode']);
    this.apiKey = result.openaiApiKey || null;
    this.userData = result.userData || {};
    (result.sensitiveKeys || []).forEach((k: string) => this.sensitiveKeys.add(k));
    this.usageMode = (result.usageMode as typeof this.usageMode) || 'conservative';
  }

  async setApiKey(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    await chrome.storage.sync.set({ openaiApiKey: apiKey });
  }

  async updateUserData(newData: Partial<UserData>): Promise<void> {
    const sanitized: Partial<UserData> = {};
    for (const [k, v] of Object.entries(newData)) {
      const key = String(k);
      if (!this.sensitiveKeys.has(key) && v !== undefined) {
        (sanitized as Record<string, unknown>)[key] = v;
      }
    }
    this.userData = { ...this.userData, ...sanitized };
    await chrome.storage.sync.set({ userData: this.userData });
  }

  async setSensitiveKeys(keys: string[]): Promise<void> {
    this.sensitiveKeys = new Set(keys);
    await chrome.storage.sync.set({ sensitiveKeys: Array.from(this.sensitiveKeys) });
  }

  getSensitiveKeys(): string[] {
    return Array.from(this.sensitiveKeys);
  }

  async setUsageMode(mode: 'auto' | 'conservative' | 'off'): Promise<void> {
    this.usageMode = mode;
    await chrome.storage.sync.set({ usageMode: mode });
  }

  getUsageMode(): 'auto' | 'conservative' | 'off' {
    return this.usageMode;
  }

  getUserData(): UserData {
    return this.userData;
  }

  // Efficient AI call with caching
  private async callOpenAI(prompt: string, cacheKey?: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not set');
    }

    // Respect rate limits if set
    if (this.rateLimitedUntilMs && Date.now() < this.rateLimitedUntilMs) {
      const waitSeconds = Math.ceil((this.rateLimitedUntilMs - Date.now()) / 1000);
      throw new Error(`OpenAI rate limited. Try again in ~${waitSeconds}s`);
    }

    // Check cache first
    if (cacheKey && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Small retry with exponential backoff (handles minor blips but avoids spamming)
      const attempt = async (): Promise<Response> => {
        return await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // Use a cheap, high‑rate model for form filling
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are a helpful assistant that fills out forms based on user data. Be concise and professional. Return only the answer without explanations.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 120,
            temperature: 0.4,
          }),
        });
      };

      let response = await attempt();
      if (response.status === 429) {
        // Respect retry-after or back off 30s
        const retryAfterHeader = response.headers.get('retry-after');
        const retrySeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) || 30 : 30;
        this.rateLimitedUntilMs = Date.now() + retrySeconds * 1000;
        throw new Error('OpenAI rate limited');
      }

      // One lightweight retry for transient 5xx
      if (!response.ok && response.status >= 500) {
        await new Promise(r => setTimeout(r, 500));
        response = await attempt();
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`OpenAI API error (${response.status}): ${text || response.statusText}`);
      }

      const data = await response.json();
      const answer = data.choices[0].message.content.trim();

      // Cache the result
      if (cacheKey) {
        this.cache.set(cacheKey, answer);
      }

      return answer;
    } catch (error) {
      console.error('OpenAI API call failed:', error);
      throw error;
    }
  }

  // New: Bulk generation for all fields in one prompt to reduce API calls
  async generateValuesForFields(fields: FormField[]): Promise<Record<string, string>> {
    const cacheKey = `bulk_${fields.map(f => (f.label || f.placeholder || f.name || f.id)).join('|')}`;
    const schemaExample = fields.map((f, idx) => ({
      key: `field_${idx}`,
      label: (f.label || f.placeholder || f.name || f.id || `Field ${idx + 1}`).slice(0, 80),
      type: f.type.slice(0, 30)
    }));

    const websiteUrl = location.href;
    const prompt = SYSTEM_PROMPT
      .replace('{{form_fields}}', JSON.stringify(schemaExample, null, 2))
      .replace('{{user_data}}', JSON.stringify(this.userData, null, 2))
      .replace('{{website_url}}', websiteUrl);

    const json = await this.callOpenAI(prompt, cacheKey);
    try {
      const parsed = JSON.parse(json);
      return parsed as Record<string, string>;
    } catch {
      // If the model returns extra text, try to extract JSON via regex
      const match = json.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          console.warn('Failed to parse extracted JSON, falling back to per-field calls');
        }
      }
      // Fallback
      const result: Record<string, string> = {};
      let index = 0;
      for (const f of fields) {
        result[`field_${index}`] = await this.getFieldValue(f);
        index++;
      }
      return result;
    }
  }

  // Smart form field detection and mapping
  detectFormFields(): FormField[] {
    console.log('AIService: Starting form field detection...');
    const fields: FormField[] = [];
    const selectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[type="url"]',
      'input[type="number"]',
      'input[type="date"]',
      'textarea',
      'select'
    ];

    console.log('AIService: Document ready state:', document.readyState);
    console.log('AIService: Document body exists:', !!document.body);

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      console.log(`AIService: Found ${elements.length} elements for selector: ${selector}`);
      
      elements.forEach(element => {
        const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (input.disabled || (input as HTMLInputElement | HTMLTextAreaElement).readOnly) {
          console.log('AIService: Skipping disabled/readonly field:', input);
          return;
        }

        const field: FormField = {
          element: input,
          type: input.type || input.tagName.toLowerCase(),
          name: input.name || '',
          id: input.id || '',
          placeholder: (input as HTMLInputElement | HTMLTextAreaElement).placeholder || '',
          label: this.getFieldLabel(input),
          required: input.required || false
        };

        console.log('AIService: Adding field:', field);
        fields.push(field);
      });
    });

    // Google Forms and other custom UIs often use contenteditable divs and aria roles
    // Try to detect those as well
    const editableCandidates = document.querySelectorAll<HTMLElement>(
      '[contenteditable="true"], div[role="textbox"], textarea[aria-label], input[aria-label]'
    );
    editableCandidates.forEach((el) => {
      // Skip if already captured by previous selectors
      if ((fields as Array<{ element: Element }>).some(f => f.element === el)) return;

      const field: FormField = {
        element: el,
        type: el.getAttribute('role') || 'textbox',
        name: el.getAttribute('name') || '',
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || '',
        label: this.getFieldLabel(el),
        required: el.getAttribute('aria-required') === 'true'
      };
      console.log('AIService: Adding contenteditable/aria field:', field);
      fields.push(field);
    });

    console.log('AIService: Total fields detected:', fields.length);
    return fields;
  }

  private getFieldLabel(element: HTMLElement): string {
    // Try multiple methods to get field label
    const methods = [
      () => {
        const label = document.querySelector(`label[for="${element.id}"]`);
        return label?.textContent?.trim() || '';
      },
      () => {
        const parent = element.closest('div, p, td, th');
        const label = parent?.querySelector('label');
        return label?.textContent?.trim() || '';
      },
      // ARIA associations
      () => {
        const labelledBy = element.getAttribute('aria-labelledby');
        if (!labelledBy) return '';
        return labelledBy
          .split(/\s+/)
          .map(id => document.getElementById(id)?.textContent?.trim() || '')
          .filter(Boolean)
          .join(' ');
      },
      // Fieldset legend
      () => {
        const fs = element.closest('fieldset');
        const legend = fs?.querySelector('legend');
        return legend?.textContent?.trim() || '';
      },
      () => {
        const prevSibling = element.previousElementSibling;
        if (prevSibling && prevSibling.textContent) {
          return prevSibling.textContent.trim();
        }
        return '';
      },
      () => element.getAttribute('aria-label') || '',
      () => (element as HTMLInputElement | HTMLTextAreaElement).placeholder || '',
      () => (element as HTMLInputElement | HTMLTextAreaElement).name || '',
      () => element.id || '',
      // Nearby headings or prompts (useful for Google Forms / Indeed)
      () => this.getNearbyPromptText(element)
    ];

    for (const method of methods) {
      const label = method();
      if (label) return label;
    }

    return '';
  }

  // Crawl nearby DOM to find a human-visible prompt/heading for a field
  private getNearbyPromptText(element: HTMLElement): string {
    const container = element.closest('div, section, form') as HTMLElement | null;
    if (!container) return '';

    // Candidate selectors for prompts/headings
    const candidates = [
      '[role="heading"]', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'legend', 'label', 'p'
    ];

    // Look backwards through previous siblings up to a small window
    let cursor: Element | null = element;
    for (let hops = 0; hops < 5 && cursor; hops++) {
      const prev = cursor.previousElementSibling as HTMLElement | null;
      if (prev) {
        for (const sel of candidates) {
          const node = prev.matches(sel) ? prev : prev.querySelector(sel);
          const txt = node?.textContent?.trim();
          if (txt) return txt;
        }
      }
      cursor = prev;
    }

    // As a fallback, search upwards for a container that has a heading/prompt
    let parent: HTMLElement | null = element.parentElement;
    for (let depth = 0; depth < 4 && parent; depth++) {
      for (const sel of candidates) {
        const node = parent.matches(sel) ? parent : parent.querySelector(sel);
        const txt = node?.textContent?.trim();
        if (txt) return txt;
      }
      parent = parent.parentElement;
    }
    return '';
  }

  private normalizeLabel(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private labelMatchesCategory(label: string, category: string): boolean {
    const norm = this.normalizeLabel(label);
    const synonyms: Record<string, string[]> = {
      name: ['name', 'full name', 'your name', 'applicant name'],
      email: ['email', 'e-mail', 'mail id', 'email address'],
      phone: ['phone', 'mobile', 'mobile number', 'cell', 'cellphone', 'contact number', 'whatsapp number', 'telephone', 'tel'],
      address: ['address', 'street', 'home address', 'line address'],
      city: ['city', 'town'],
      state: ['state', 'province', 'region'],
      zipCode: ['zip', 'zipcode', 'postal code', 'pin code', 'pincode'],
      country: ['country', 'nation'],
      dateOfBirth: ['dob', 'date of birth', 'birth date', 'birthday'],
      linkedin: ['linkedin', 'linked in'],
      github: ['github', 'git hub'],
      portfolio: ['portfolio', 'website', 'site url', 'personal site', 'portfolio url'],
      experience: ['experience', 'work experience', 'professional experience'],
      education: ['education', 'qualification', 'degree', 'academics'],
      skills: ['skills', 'skillset', 'technical skills'],
      salary: ['salary', 'ctc', 'compensation', 'expected salary'],
      availability: ['availability', 'available from', 'notice period', 'join'],
      relocation: ['relocation', 'willing to relocate', 'move city']
    };
    const words = synonyms[category] || [category];
    return words.some(w => norm.includes(this.normalizeLabel(w)));
  }

  private async tryMapWithoutAI(field: FormField): Promise<string> {
    const fieldText = this.normalizeLabel(`${field.label} ${field.placeholder} ${field.name} ${field.id}`);
    const mappingOrder: Array<[keyof UserData, string | undefined]> = [
      ['name', this.userData.name],
      ['email', this.userData.email],
      ['phone', this.userData.phone],
      ['address', this.userData.address],
      ['city', this.userData.city],
      ['state', this.userData.state],
      ['zipCode', this.userData.zipCode],
      ['country', this.userData.country],
      ['dateOfBirth', this.userData.dateOfBirth],
      ['linkedin', this.userData.linkedin],
      ['github', this.userData.github],
      ['portfolio', this.userData.portfolio],
      ['experience', this.userData.experience],
      ['education', this.userData.education],
      ['skills', this.userData.skills?.join(', ')],
      ['salary', this.userData.salary],
      ['availability', this.userData.availability]
    ];
    for (const [key, value] of mappingOrder) {
      if (!value) continue;
      if (this.labelMatchesCategory(fieldText, String(key))) {
        return value;
      }
    }
    if (this.labelMatchesCategory(fieldText, 'relocation')) {
      return this.userData.relocation ? 'Yes' : 'No';
    }
    return '';
  }

  // Map field to user data or generate AI response
  async getFieldValue(field: FormField): Promise<string> {
    const fieldText = this.normalizeLabel(`${field.label} ${field.placeholder} ${field.name} ${field.id}`);

    // Direct mapping for common fields
    const mappingOrder: Array<[keyof UserData, string | undefined]> = [
      ['name', this.userData.name],
      ['email', this.userData.email],
      ['phone', this.userData.phone],
      ['address', this.userData.address],
      ['city', this.userData.city],
      ['state', this.userData.state],
      ['zipCode', this.userData.zipCode],
      ['country', this.userData.country],
      ['dateOfBirth', this.userData.dateOfBirth],
      ['linkedin', this.userData.linkedin],
      ['github', this.userData.github],
      ['portfolio', this.userData.portfolio],
      ['experience', this.userData.experience],
      ['education', this.userData.education],
      ['skills', this.userData.skills?.join(', ')],
      ['salary', this.userData.salary],
      ['availability', this.userData.availability]
    ];

    for (const [key, value] of mappingOrder) {
      if (!value) continue;
      if (this.labelMatchesCategory(fieldText, String(key))) {
        return value;
      }
    }

    // Handle special cases
    if (this.labelMatchesCategory(fieldText, 'relocation')) {
      return this.userData.relocation ? 'Yes' : 'No';
    }

    if (fieldText.includes('time') && fieldText.includes('interview')) {
      return this.userData.availability || 'I am flexible and available during business hours';
    }

    // For subjective questions, use AI
    if (this.isSubjectiveQuestion(fieldText)) {
      return await this.generateSubjectiveAnswer(fieldText, field);
    }

    // For unknown fields, try to infer from context
    return await this.inferFieldValue(fieldText);
  }

  private isSubjectiveQuestion(fieldText: string): boolean {
    const subjectiveKeywords = [
      'why', 'what', 'how', 'describe', 'explain', 'tell us', 'interest',
      'motivation', 'passion', 'goal', 'objective', 'strength', 'weakness',
      'challenge', 'experience', 'story', 'example', 'situation'
    ];

    return subjectiveKeywords.some(keyword => fieldText.includes(keyword));
  }

  private async generateSubjectiveAnswer(fieldText: string, field: FormField): Promise<string> {
    const cacheKey = `subjective_${fieldText}`;
    
    const prompt = `Based on this form field: "${field.label || field.placeholder || field.name}"
    
Context: ${fieldText}

User profile:
- Name: ${this.userData.name || 'Not provided'}
- Skills: ${this.userData.skills?.join(', ') || 'Not provided'}
- Experience: ${this.userData.experience || 'Not provided'}
- Education: ${this.userData.education || 'Not provided'}

Generate a professional, concise answer (max 2-3 sentences) that would be appropriate for this field.`;

    return await this.callOpenAI(prompt, cacheKey);
  }

  private async inferFieldValue(fieldText: string): Promise<string> {
    const cacheKey = `infer_${fieldText}`;
    
    const prompt = `Based on this form field context: "${fieldText}"
    
User data available:
${JSON.stringify(this.userData, null, 2)}

What would be the most appropriate value to fill in this field? Return only the value, no explanation.`;

    return await this.callOpenAI(prompt, cacheKey);
  }

  // Main form filling method
  async fillForm(): Promise<{ filled: number; total: number; errors: string[] }> {
    const fields = this.detectFormFields();
    const results = { filled: 0, total: fields.length, errors: [] as string[] };

    // Decide AI strategy based on usage mode
    let bulkValues: Record<string, string> | null = null;
    if (this.usageMode === 'auto') {
      // One bulk call for all fields
      try {
        bulkValues = await this.generateValuesForFields(fields);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.toLowerCase().includes('rate limited')) {
          results.errors.push('OpenAI rate limited. Please wait and try again.');
          return results;
        }
        console.warn('Bulk generation failed, falling back to conservative path:', e);
      }
    }

    let fieldIndex = 0;
    const learned: Array<{ key: string; label: string; value: string }> = [];
    for (const field of fields) {
      try {
        let value = '';
        if (bulkValues && Object.prototype.hasOwnProperty.call(bulkValues, `field_${fieldIndex}`)) {
          value = bulkValues[`field_${fieldIndex}`];
        } else {
          // Conservative/off modes: only call AI when necessary
          const mapped = await this.tryMapWithoutAI(field);
          if (mapped) {
            value = mapped;
          } else if (this.usageMode === 'conservative') {
            // Only for subjective or clearly unknown fields
            const label = this.normalizeLabel(`${field.label} ${field.placeholder} ${field.name}`);
            if (this.isSubjectiveQuestion(label)) {
              value = await this.generateSubjectiveAnswer(label, field);
            } else {
              // skip AI, leave empty for user to review
              value = '';
            }
          } else if (this.usageMode === 'off') {
            value = '';
          } else {
            // auto fallback: per-field AI if bulk not available
            value = await this.getFieldValue(field);
          }
        }
        
        if (value) {
          // Fill the field
          if (field.element.tagName === 'SELECT') {
            const select = field.element as HTMLSelectElement;
            // Try to find matching option
            const option = Array.from(select.options).find(opt => 
              opt.value.toLowerCase().includes(value.toLowerCase()) ||
              opt.text.toLowerCase().includes(value.toLowerCase())
            );
            if (option) {
              select.value = option.value;
            }
          } else if ((field.element as HTMLElement).getAttribute('contenteditable') === 'true' || (field.element as HTMLElement).getAttribute('role') === 'textbox') {
            // Handle Google Forms style contenteditable fields
            const el = field.element as HTMLElement;
            el.textContent = value;
          } else {
            (field.element as HTMLInputElement | HTMLTextAreaElement).value = value;
          }

          // Trigger change event
          field.element.dispatchEvent(new Event('input', { bubbles: true }));
          field.element.dispatchEvent(new Event('change', { bubbles: true }));
          
          results.filled++;

          // Capture potential new profile items if not already in profile and not sensitive
          const label = (field.label || field.placeholder || field.name || '').toLowerCase();
          const inferredKey = this.inferProfileKeyFromLabel(label);
          if (inferredKey && !(inferredKey in this.userData) && !this.sensitiveKeys.has(String(inferredKey))) {
            learned.push({ key: String(inferredKey), label: String(inferredKey), value });
          }
        }
      } catch (error) {
        results.errors.push(`Error filling ${field.label || field.name}: ${error}`);
      }
      fieldIndex++;
    }

    // Attach suggestions for UI review (content script will include it in the response)
    (results as unknown as { suggestedProfileUpdates?: Array<{ key: string; label: string; value: string }> }).suggestedProfileUpdates = learned;
    return results;
  }

  private inferProfileKeyFromLabel(label: string): keyof UserData | null {
    const tests: Array<[RegExp, keyof UserData]> = [
      [/email|e-mail|mail/, 'email'],
      [/name|full name|first name|last name/, 'name'],
      [/phone|mobile|contact number|tel/, 'phone'],
      [/linkedin|linked\s*in/, 'linkedin'],
      [/github/, 'github'],
      [/portfolio|website|url/, 'portfolio'],
      [/address/, 'address'],
      [/city/, 'city'],
      [/state|province/, 'state'],
      [/zip|postal/, 'zipCode'],
      [/country/, 'country'],
      [/availability|available/, 'availability'],
      [/salary|ctc|compensation/, 'salary']
    ];
    for (const [rx, key] of tests) {
      if (rx.test(label)) return key;
    }
    return null;
  }

  // Clear cache to save storage
  clearCache(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

export const aiService = new AIService();
export type { UserData, FormField };
