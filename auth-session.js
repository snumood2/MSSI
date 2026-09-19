const AUTH_HANDOFF_KEY = "mssi_auth_handoff";
const AUTH_WINDOW_PREFIX = "MSSI_AUTH:";
const AUTH_HANDOFF_TTL_MS = 60_000;

export function storeAuthSessionHandoff(session) {
  // Retire the legacy window.name carrier even if the new session is invalid.
  if (window.name.startsWith(AUTH_WINDOW_PREFIX)) window.name = "";
  if (!session?.access_token || !session?.refresh_token) return;
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    created_at: Date.now()
  });
  // A same-origin, same-tab handoff must never put credentials in window.name.
  // If storage is unavailable, the Supabase session remains the primary path.
  try { sessionStorage.setItem(AUTH_HANDOFF_KEY, payload); } catch { /* unavailable */ }
}

export async function getAuthSession(sb) {
  let raw = null;
  try {
    raw = sessionStorage.getItem(AUTH_HANDOFF_KEY);
    sessionStorage.removeItem(AUTH_HANDOFF_KEY);
  } catch { /* storage can be disabled in private browsing */ }
  // Clean up before the early return for an already established session.
  if (window.name.startsWith(AUTH_WINDOW_PREFIX)) window.name = "";
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) return data.session;
  if (!raw) return null;

  try {
    const handoff = JSON.parse(raw);
    const age = Date.now() - handoff.created_at;
    if (!Number.isFinite(handoff.created_at) || age < 0 || age > AUTH_HANDOFF_TTL_MS) return null;
    if (typeof handoff.access_token !== "string" || !handoff.access_token
        || typeof handoff.refresh_token !== "string" || !handoff.refresh_token) return null;
    const { data: restored, error } = await sb.auth.setSession({
      access_token: handoff.access_token,
      refresh_token: handoff.refresh_token
    });
    if (!error && restored?.session) return restored.session;

    const { data: refreshed, error: refreshError } = await sb.auth.refreshSession({
      refresh_token: handoff.refresh_token
    });
    return refreshError ? null : (refreshed?.session || null);
  } catch {
    return null;
  }
}
