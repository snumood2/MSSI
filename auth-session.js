const AUTH_HANDOFF_KEY = "mssi_auth_handoff";
const AUTH_WINDOW_PREFIX = "MSSI_AUTH:";
const AUTH_HANDOFF_TTL_MS = 60_000;

export function storeAuthSessionHandoff(session) {
  if (!session?.access_token || !session?.refresh_token) return;
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    created_at: Date.now()
  });
  sessionStorage.setItem(AUTH_HANDOFF_KEY, payload);
  window.name = `${AUTH_WINDOW_PREFIX}${payload}`;
}

export async function getAuthSession(sb) {
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) return data.session;

  let raw = sessionStorage.getItem(AUTH_HANDOFF_KEY);
  sessionStorage.removeItem(AUTH_HANDOFF_KEY);
  if (!raw && window.name.startsWith(AUTH_WINDOW_PREFIX)) {
    raw = window.name.slice(AUTH_WINDOW_PREFIX.length);
  }
  if (window.name.startsWith(AUTH_WINDOW_PREFIX)) window.name = "";
  if (!raw) return null;

  try {
    const handoff = JSON.parse(raw);
    if (!handoff.created_at || Date.now() - handoff.created_at > AUTH_HANDOFF_TTL_MS) return null;
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
