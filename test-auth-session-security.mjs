import assert from 'node:assert/strict';
import { storeAuthSessionHandoff, getAuthSession } from './auth-session.js';

const values = new Map();
globalThis.window = { name: 'MSSI_AUTH:legacy-secret' };
globalThis.sessionStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
const fake = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', user: { id: 'synthetic' } };
let restores = 0;
const client = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    setSession: async () => { restores++; return { data: { session: fake } }; },
    refreshSession: async () => ({ data: { session: fake } }),
  },
};
storeAuthSessionHandoff(fake);
assert.equal(window.name, '');
assert.equal(await getAuthSession(client), fake);
assert.equal(values.size, 0);
assert.equal(restores, 1);
assert.equal(await getAuthSession(client), null, 'handoff is single use');

storeAuthSessionHandoff(fake);
window.name = 'MSSI_AUTH:legacy-secret';
assert.equal(await getAuthSession({ auth: { getSession: async () => ({ data: { session: fake } }) } }), fake);
assert.equal(window.name, '');
assert.equal(values.size, 0, 'existing sessions must also clear the token copy');

for (const created_at of [Date.now() - 60_001, Date.now() + 60_000, 'not-a-time']) {
  sessionStorage.setItem('mssi_auth_handoff', JSON.stringify({ ...fake, created_at }));
  assert.equal(await getAuthSession(client), null);
}
for (const raw of ['invalid json', JSON.stringify({ created_at: Date.now() })]) {
  sessionStorage.setItem('mssi_auth_handoff', raw);
  assert.equal(await getAuthSession(client), null);
}
window.name = 'MSSI_AUTH:' + JSON.stringify({ ...fake, created_at: Date.now() });
assert.equal(await getAuthSession(client), null, 'legacy window.name is never trusted');
assert.equal(window.name, '');
window.name = 'unrelated-tab-name';
storeAuthSessionHandoff(fake);
assert.equal(window.name, 'unrelated-tab-name');
values.clear();
globalThis.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
assert.doesNotThrow(() => storeAuthSessionHandoff(fake));
assert.equal(await getAuthSession(client), null);
assert.equal(restores, 1);
console.log('Auth handoff security: 16 checks passed');
