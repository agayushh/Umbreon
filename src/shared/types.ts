/** Shared types for the FillIt extension. */

export interface ContextEntry {
  id: string;
  title: string;
  description: string;
  category:
    | "project"
    | "experience"
    | "achievement"
    | "leadership"
    | "education"
    | "certification"
    | "other";
  skills?: string[];
  impact?: string;
  timestamp: number;
}

export interface UserData {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  twitter?: string;
  website?: string;
  currentRole?: string;
  yearsOfExperience?: string;
  skills?: string[];
  education?: string;
  certifications?: string[];
  previousCompanies?: string[];
  languages?: string[];
  salary?: string;
  relocation?: boolean;
  availability?: string;
  workType?: "remote" | "hybrid" | "onsite";
  contextEntries?: ContextEntry[];
  [key: string]: unknown;
}

export interface FormField {
  element:
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | HTMLElement;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  label: string;
  required: boolean;
  autocomplete?: string;
}

export interface LearnedEntry {
  fieldLabel: string;
  value: string;
  domain: string;
  timestamp: number;
  source: "submission" | "manual";
}

export interface FillItBackup {
  version?: string;
  exportedAt?: string;
  userData?: Partial<UserData>;
  contextEntries?: ContextEntry[];
  learnedData?: Record<string, LearnedEntry[]>;
  formHistory?: { entries?: LearnedEntry[] };
}

export interface FieldMatch {
  value: string;
  confidence: number;
  method:
    | "synonym"
    | "fuzzy"
    | "semantic"
    | "context"
    | "template"
    | "generated"
    | "survey"
    | "prompted"
    | "none";
  /** Index into the detectFormFields() array for this page. */
  fieldIndex?: number;
}

export interface FormContext {
  type:
    | "job-application"
    | "registration"
    | "checkout"
    | "survey"
    | "government"
    | "contact"
    | "login"
    | "feedback"
    | "generic";
  domain: string;
  pageTitle: string;
  confidence: number;
}

export interface FormHistory {
  entries: LearnedEntry[];
}

export interface FillResult {
  filled: number;
  total: number;
  errors: string[];
  suggestedProfileUpdates?: Array<{
    key: string;
    label: string;
    value: string;
  }>;
  matches?: FieldMatch[];
  unfilled?: Array<{ label: string; method: string; fieldIndex: number }>;
}

export interface DetectFormsResponse {
  count: number;
  fields: Array<{
    type: string;
    name: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
}

export interface FillFormResponse {
  success: boolean;
  message: string;
  stats?: FillResult;
}
