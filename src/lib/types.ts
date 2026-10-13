export const STATUSES = ["wishlist", "applied", "interview", "offer", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

// Validated with the dataviz palette checker on the dark card surface (in this
// order: adjacent pairs clear CVD and normal-vision separation).
export const STATUS_META: Record<Status, { label: string; color: string; hint: string }> = {
  wishlist: { label: "Wishlist", color: "#9085e9", hint: "Saved, not applied yet" },
  applied: { label: "Applied", color: "#c98500", hint: "Waiting to hear back" },
  interview: { label: "Interview", color: "#3987e5", hint: "In the process" },
  offer: { label: "Offer", color: "#199e70", hint: "You got it" },
  rejected: { label: "Rejected", color: "#e66767", hint: "Closed" },
};

export type AiMatch = {
  score: number;
  best_resume_id: string | null;
  best_resume_name: string;
  verdict: string;
  matched_keywords: string[];
  missing_keywords: string[];
  suggestions: string[];
  analyzed_at: string;
};

export type Resume = {
  id: string;
  name: string;
  file_path: string | null;
  content: string;
  is_default: boolean;
  created_at: string;
};

export type Application = {
  id: string;
  company: string;
  role: string;
  status: Status;
  position: number;
  location: string | null;
  work_mode: WorkMode | null;
  salary: string | null;
  job_url: string | null;
  source: string | null;
  job_description: string | null;
  resume_id: string | null;
  applied_at: string | null;
  follow_up_at: string | null;
  notes: string | null;
  ai_match: AiMatch | null;
  cover_letter: string | null;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: string;
  application_id: string;
  kind: string;
  title: string;
  created_at: string;
};

export type ActivityWithApp = Activity & {
  applications: { company: string; role: string } | null;
};

// What application forms keep asking for. Stored in the user's Appwrite prefs
// and sent to the local helper when auto-filling a form.
export const PROFILE_KEYS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "location",
  "linkedin",
  "github",
  "portfolio",
  "current_company",
  "current_title",
  "years_experience",
  "notice_period",
  "salary_expectation",
  "work_authorization",
  "needs_sponsorship",
  "willing_to_relocate",
  "heard_from",
  "languages",
  "extra",
] as const;
export type Profile = Record<(typeof PROFILE_KEYS)[number], string>;
