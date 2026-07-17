import { ADMIN_EMAIL, ADMIN_USER_ID } from "./config.js";

function usesGoogleIdentity(user) {
  const providers = Array.isArray(user?.app_metadata?.providers)
    ? user.app_metadata.providers
    : [];
  const identityProviders = Array.isArray(user?.identities)
    ? user.identities.map(identity => identity?.provider)
    : [];
  return user?.app_metadata?.provider === "google"
    || providers.includes("google")
    || identityProviders.includes("google");
}

export async function validateAdminSession(sb, session) {
  const user = session?.user;
  if (!user) return { ok: false, reason: "로그인이 필요합니다." };
  if (user.id !== ADMIN_USER_ID || user.email?.toLowerCase() !== ADMIN_EMAIL) {
    return { ok: false, reason: "허용된 관리자 Google 계정이 아닙니다." };
  }
  if (!usesGoogleIdentity(user)) {
    return { ok: false, reason: "관리자는 Google 계정으로만 로그인할 수 있습니다." };
  }

  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, role, email")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return { ok: false, reason: "관리자 권한을 확인하지 못했습니다." };
  if (profile?.role !== "admin" || profile.id !== ADMIN_USER_ID) {
    return { ok: false, reason: "관리자 권한이 없습니다." };
  }
  return { ok: true, user, profile };
}

export async function signInAdminWithGoogle(sb, redirectPage = "admin.html") {
  const redirectTo = new URL(redirectPage, window.location.href).href;
  return sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { prompt: "select_account" }
    }
  });
}
