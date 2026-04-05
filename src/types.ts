/** Shared types for the FillIt extension. */

export interface UserData {
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
}

export interface LearnedEntry {
  fieldLabel: string;
  value: string;
  domain: string;
  timestamp: number;
  source: "submission" | "manual";
}

export interface FormHistory {
  entries: LearnedEntry[];
  profileUpdates: Record<string, string>;
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
}
