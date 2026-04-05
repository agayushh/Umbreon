# FillIt — AI Form Filler Browser Extension

An intelligent Chrome extension that automatically fills any web form using AI, with adaptive learning and efficient API usage.

## Features

🤖 **AI-Powered Form Filling**: Uses OpenAI's GPT-4o-mini to intelligently fill forms
🧠 **Adaptive Learning**: Learns from every form you submit — your corrections improve future fills
⚡ **Efficient API Usage**: Caches responses, uses direct field mapping, and learns from history to minimize API calls
🔒 **Privacy-Focused**: All data stored locally in Chrome storage — nothing goes anywhere except OpenAI API
📝 **Smart Field Detection**: Detects inputs, textareas, selects, contenteditable elements, and ARIA textboxes
🎯 **Subjective Question Handling**: AI generates contextual answers for open-ended questions
🛡️ **Robust**: Skips passwords, hidden fields, CAPTCHAs; handles rate limits and timeouts gracefully

## Installation

1. Clone this repository
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Build the extension:

   ```bash
   pnpm build
   ```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

## Setup

1. **Get OpenAI API Key**: Visit [OpenAI API](https://platform.openai.com/api-keys) and create a key
2. **Configure**: Click the extension icon → "Set API Key" → paste your key
3. **Set Up Profile**: Click ⚙️ → fill in your personal & professional info → Save

## Usage

1. Navigate to any form (Google Forms, job applications, registration forms, etc.)
2. Click the extension icon → "Fill Form with AI"
3. Review and edit the filled values as needed
4. Submit the form — **FillIt learns from your corrections automatically**

### How Learning Works

- When you submit a form, FillIt captures the final field values
- These are stored locally, grouped by website domain
- Next time you fill a similar form, your previous answers are used first
- You can review, delete, or merge learned data in Settings → Learning History

### AI Usage Modes

| Mode             | Behavior                                         |
| ---------------- | ------------------------------------------------ |
| **Auto**         | One bulk AI call for all fields                  |
| **Conservative** | AI only for subjective questions                 |
| **Off**          | Profile data + learned history only, no AI calls |

## Cost Optimization

- **Direct Mapping**: Common fields filled from profile — no AI needed
- **Learned History**: Previously submitted values reused without AI
- **Caching**: Similar questions reuse cached AI responses
- **Efficient Model**: Uses GPT-4o-mini
- **Limited Tokens**: Responses capped at 120 tokens

## Privacy & Security

- **Local Storage**: All data in Chrome's encrypted storage
- **No External Servers**: Only communicates with OpenAI API
- **Learning is Local**: Form history never leaves your browser
- **Skip Sensitive**: Passwords, hidden fields, CAPTCHAs are never touched

## Development

```bash
pnpm install      # Install dependencies
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # Run ESLint
```

## License

MIT License
