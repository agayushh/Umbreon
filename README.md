# FillIt — Local Form Filler

Chrome extension that fills web forms from a profile stored in your browser. Matching runs on-device. No API keys.

## Features

- **Local matching**: synonym, fuzzy, and optional MiniLM semantic matching
- **Profile & context memory**: personal details plus projects/experience for open-ended questions
- **Resume / LinkedIn / JSON import**: paste text, upload a PDF, or restore a backup
- **Learned answers**: form submissions are remembered per domain
- **Survey mode**: fills remaining survey-style fields when profile data does not match

## Install

```bash
pnpm install
pnpm build
```

Load the unpacked extension from the `dist` folder in `chrome://extensions/` (Developer mode).

## Setup

1. Open **Settings** (extension icon → gear, or right-click → Options)
2. Fill in your profile, or import a resume, LinkedIn export, or JSON backup
3. Optionally enable on-device models under Settings for semantic matching

## Usage

1. Open a form (job application, registration, Google Form, etc.)
2. Click the extension icon → **Fill Form**
3. Review filled values; type answers for prompted fields
4. Submit — FillIt stores the final values for next time

Sensitive fields (passwords, SSN, payment data, CAPTCHAs) are never filled.

## Development

```bash
pnpm install      # Install dependencies
pnpm dev          # Start extension dev server
pnpm build        # Production build
pnpm test         # Matcher + parser tests
pnpm lint         # Run ESLint
```

## License

MIT License
