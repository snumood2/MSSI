import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADMIN_USER_ID } from "./config.js";
import { validateAdminSession } from "./admin-auth.js";

const config = readFileSync("./config.js", "utf8");
const helper = readFileSync("./admin-auth.js", "utf8");
const admin = readFileSync("./admin.html", "utf8");
const login = readFileSync("./login.html", "utf8");
const index = readFileSync("./index.html", "utf8");

assert.match(config, /export const ADMIN_USER_ID = ENV\.ADMIN_USER_ID \|\| "[0-9a-f-]{36}"/);
assert.match(helper, /signInWithOAuth\(\{/);
assert.match(helper, /provider: "google"/);
assert.match(helper, /redirect\.searchParams\.set\("oauth_cb", Date\.now\(\)\.toString\(\)\)/);
assert.match(helper, /user\.id !== ADMIN_USER_ID/);
assert.match(helper, /profile\?\.role !== "admin"/);
assert.match(helper, /providers\.includes\("google"\)/);

assert.match(admin, /id="btnGoogleLogin"/);
assert.match(admin, /body:not\(\.admin-authenticated\) #mainHeader/);
assert.match(admin, /class="admin-unauthenticated"/);
assert.match(admin, /function setAuthenticatedUi\(isAuthenticated\)/);
assert.doesNotMatch(admin, /관리자 로그인<\/h2>/);
assert.doesNotMatch(admin, /등록된 관리자 Google 계정으로만 접속할 수 있습니다/);
assert.doesNotMatch(admin, /id="authMsg"/);
assert.doesNotMatch(admin, /href="admin\.html" class="active">대시보드/);
assert.doesNotMatch(admin, /href="admin\.html#pending">승인대기/);
assert.doesNotMatch(admin, /href="admin\.html#doctors">의사관리/);
assert.doesNotMatch(admin, /href="patient-number-requests\.html">의사에게 받은 번호 변경/);
assert.doesNotMatch(admin, /id="userBadge"/);
assert.match(admin, /id="btnLogout"/);
assert.match(admin, /validateAdminSession/);
assert.match(admin, /sb\.auth\.getUser\(\)/);
assert.match(admin, /sb\.auth\.onAuthStateChange/);
assert.match(admin, /"INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"/);
assert.doesNotMatch(admin, /id="a_pw"|signInWithPassword/);
assert.doesNotMatch(admin, /el\("a_(?:pw|email)"\)/);
assert.match(login, /selectedRole === "admin"[\s\S]*signInAdminWithGoogle/);
assert.doesNotMatch(login, /id="a_pw"/);
assert.doesNotMatch(index, /user\.email\?\.toLowerCase\(\) === ADMIN_EMAIL/);

function mockClient(profile) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: profile, error: null }) };
            }
          };
        }
      };
    }
  };
}

const googleAdmin = {
  id: ADMIN_USER_ID,
  email: "snumood@gmail.com",
  app_metadata: { provider: "email", providers: ["email", "google"] }
};
const adminProfile = { id: ADMIN_USER_ID, email: "snumood@gmail.com", role: "admin" };
assert.equal((await validateAdminSession(mockClient(adminProfile), { user: googleAdmin })).ok, true);
assert.equal((await validateAdminSession(mockClient(adminProfile), {
  user: { ...googleAdmin, app_metadata: { provider: "email", providers: ["email"] } }
})).ok, false);
assert.equal((await validateAdminSession(mockClient(adminProfile), {
  user: { ...googleAdmin, id: "00000000-0000-0000-0000-000000000000", email: "other@example.com" }
})).ok, false);
assert.equal((await validateAdminSession(mockClient({ ...adminProfile, role: "patient" }), { user: googleAdmin })).ok, false);

console.log("admin OAuth static tests passed");
