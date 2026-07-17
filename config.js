const ENV = typeof window !== 'undefined' ? window.__ENV__ || {} : {};

export const SUPABASE_URL = ENV.VITE_SUPABASE_URL || "https://gcjdxyauirbugbugltmv.supabase.co";
export const SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY || "sb_publishable_3l7U25p2cC6pWiddxhlZlw_4vjqeDmz";

export const PATIENT_EMAIL_DOMAIN = "patient.local";
export const DOCTOR_EMAIL_DOMAIN  = "doctor.local";

export const ADMIN_EMAIL = ENV.ADMIN_EMAIL || "snumood@gmail.com";
export const ADMIN_USER_ID = ENV.ADMIN_USER_ID || "ab257db9-8d1f-4ebc-b2df-b44ec22a7838";

// Operational health checks use this public endpoint. Survey clients never post
// to it directly; submit-survey keeps the required secret server-side.
export const GOOGLE_SHEETS_WEBHOOK_URL = ENV.GOOGLE_SHEETS_WEBHOOK_URL || "https://script.google.com/macros/s/AKfycbzPLHEYNY_FAsI-zOpENr1mvm0T5FP9755G_dj9682S9rt_C1xHimjYLF_WBSH2olMbTA/exec";
