# AI Form Filler - Browser Extension

An intelligent browser extension that automatically fills any form using AI, with efficient API usage and Chrome storage integration.

## Features

🤖 **AI-Powered Form Filling**: Uses OpenAI's GPT-3.5-turbo to intelligently fill forms
⚡ **Efficient API Usage**: Caches responses and uses direct field mapping to minimize API calls
🔒 **Privacy-Focused**: Stores data locally in Chrome storage, no external servers
📝 **Smart Field Detection**: Automatically detects and maps form fields
💾 **Profile Management**: Save and manage your personal information
🎯 **Subjective Question Handling**: AI generates contextual answers for open-ended questions

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Build the extension:
   ```bash
   npm run build
   # or
   pnpm build
   ```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

## Setup

1. **Get OpenAI API Key**:
   - Visit [OpenAI API](https://platform.openai.com/api-keys)
   - Create a new API key
   - Copy the key (starts with `sk-`)

2. **Configure the Extension**:
   - Click the extension icon in your browser toolbar
   - Click "Set API Key" and enter your OpenAI API key
   - Click the settings gear icon to open the options page

3. **Set Up Your Profile**:
   - Go to the "Profile Data" tab in settings
   - Fill in your personal information (name, email, address, etc.)
   - Add your professional details (skills, experience, education)
   - Save your profile

## Usage

1. **Navigate to any form** (Google Forms, job applications, registration forms, etc.)
2. **Click the extension icon** in your browser toolbar
3. **Click "Fill Form with AI"** - the extension will:
   - Detect all form fields on the page
   - Fill basic information from your profile
   - Use AI to generate answers for subjective questions
   - Cache responses to save API costs

4. **Review and submit** the filled form

## Cost Optimization

The extension is designed to minimize API costs:

- **Direct Field Mapping**: Common fields (name, email, etc.) are filled directly from your profile
- **Response Caching**: Similar questions reuse cached AI responses
- **Efficient Model**: Uses GPT-3.5-turbo instead of more expensive models
- **Limited Response Length**: AI responses are capped to reduce token usage

## Privacy & Security

- **Local Storage**: All your data is stored locally in Chrome's encrypted storage
- **No External Servers**: Only communicates with OpenAI's API
- **Secure API Key**: Your API key is stored securely in Chrome storage
- **No Data Collection**: The extension doesn't collect or share your data

## Supported Form Types

- Google Forms
- HTML forms
- PHP forms
- Job application forms
- Registration forms
- Contact forms
- Survey forms
- And many more!

## Troubleshooting

**Extension not working?**
- Ensure your OpenAI API key is valid and has credits
- Check that forms are detected on the page
- Try refreshing the page and clicking the extension again

**AI responses seem off?**
- Update your profile data in settings
- Clear the cache to get fresh AI responses
- Check that your profile information is complete

**High API costs?**
- The extension caches responses automatically
- Use the "Clear Cache" option sparingly
- Ensure your profile data is complete to reduce AI calls

## Development

To contribute or modify the extension:

1. Install dependencies: `pnpm install`
2. Start development server: `pnpm dev`
3. Make your changes
4. Build for production: `pnpm build`

## License

MIT License - feel free to use and modify as needed.

## Support

If you encounter any issues or have suggestions, please open an issue on GitHub.