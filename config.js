const ENV = typeof window !== 'undefined' ? window.__ENV__ || {} : {};

export const SUPABASE_URL = ENV.VITE_SUPABASE_URL || "https://gcjdxyauirbugbugltmv.supabase.co";
export const SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY || "sb_publishable_3l7U25p2cC6pWiddxhlZlw_4vjqeDmz";

export const PATIENT_EMAIL_DOMAIN = "patient.local";
export const DOCTOR_EMAIL_DOMAIN  = "doctor.local";

export const ADMIN_EMAIL = ENV.ADMIN_EMAIL || "snumood@gmail.com";

export const GOOGLE_SHEETS_WEBHOOK_URL = ENV.GOOGLE_SHEETS_WEBHOOK_URL || "https://script.google.com/macros/s/AKfycbyOF1Fhb5I6vKC8mhWkxhXWCrlFalY8pKhoR0X2KynMkDpMK7B6fgIv5OAH-Usjxucp/exec";

// WEBHOOK_SECRET: loaded from env or empty (backward compatible)
export const WEBHOOK_SECRET = ENV.VITE_WEBHOOK_SECRET || "";
