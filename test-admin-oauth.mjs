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
assert.match(helper, /user\.id !== ADMIN_USER_ID/);
assert.match(helper, /profile\?\.role !== "admin"/);
assert.match(helper, /providers\.includes\("google"\)/);

assert.match(admin, /id="btnGoogleLogin"/);
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
