/** Chrome storage keys used across popup, options, and content scripts. */

export const StorageKey = {
  UserData: "userData",
  FormHistory: "formHistory",
  ContextEntries: "contextEntries",
  SurveyMode: "surveyMode",
  EnableLocalModels: "enableLocalModels",
  Theme: "theme",
  SensitiveKeys: "sensitiveKeys",
} as const;

export type StorageKeyName = (typeof StorageKey)[keyof typeof StorageKey];
