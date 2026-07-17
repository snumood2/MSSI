const AUTH_HANDOFF_KEY = "mssi_auth_handoff";
const AUTH_HANDOFF_TTL_MS = 60_000;

export function storeAuthSessionHandoff(session) {
  if (!session?.access_token || !session?.refresh_token) return;
  sessionStorage.setItem(AUTH_HANDOFF_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    created_at: Date.now()
  }));
}

export async function getAuthSession(sb) {
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) return data.session;

  const raw = sessionStorage.getItem(AUTH_HANDOFF_KEY);
  sessionStorage.removeItem(AUTH_HANDOFF_KEY);
  if (!raw) return null;

  try {
    const handoff = JSON.parse(raw);
    if (!handoff.created_at || Date.now() - handoff.created_at > AUTH_HANDOFF_TTL_MS) return null;
    const { data: restored, error } = await sb.auth.setSession({
      access_token: handoff.access_token,
      refresh_token: handoff.refresh_token
    });
    return error ? null : (restored?.session || null);
  } catch {
    return null;
  }
}
