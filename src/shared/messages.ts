/** Chrome runtime message actions. Keep popup, content, and background in sync. */

export const Action = {
  Ping: "ping",
  FillForm: "fillForm",
  DetectForms: "detectForms",
  FillSingleField: "fillSingleField",
  FormSubmitted: "formSubmitted",
  GetLearnedData: "getLearnedData",
  GetLearnedCount: "getLearnedCount",
  MergeLearnedToProfile: "mergeLearnedToProfile",
  DeleteLearnedEntry: "deleteLearnedEntry",
  ClearLearnedHistory: "clearLearnedHistory",
  ImportLearnedData: "importLearnedData",
  SaveContextEntry: "saveContextEntry",
  GetContextEntries: "getContextEntries",
  DeleteContextEntry: "deleteContextEntry",
  FetchSource: "fetchSource",
} as const;

export type ActionName = (typeof Action)[keyof typeof Action];
