import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {patientReturnTarget,patientFlowQuery} from "./patient-navigation.js";
test("patient continuation accepts only the three local views",()=>{
  for(const view of ["history","lifestyle","mssi"]){assert.equal(patientReturnTarget(`?next=${view}`),`patient.html?view=${view}`);assert.equal(patientFlowQuery(`?next=${view}`),`?next=${view}`);}
  for(const next of ["https://evil.example","//evil.example","../admin.html","mssi&patientId=other",""]){assert.equal(patientReturnTarget(`?next=${encodeURIComponent(next)}`),"respondent.html");assert.equal(patientFlowQuery(`?next=${encodeURIComponent(next)}`),"");}
});
test("patient page uses existing auth and never stores survey data locally",()=>{
  const html=fs.readFileSync("patient.html","utf8"),auth=fs.readFileSync("patient-auth.js","utf8"),bundle=fs.readFileSync("patient-bundle.js","utf8");
  assert.match(html,/patient-auth\.js\?v=patient-ui-20260922/);assert.match(html,/connect-src[^\"]*https:\/\/script\.google\.com[^\"]*https:\/\/script\.googleusercontent\.com/);assert.match(auth,/patient-bundle\.js\?v=patient-ui-20260922/);assert.match(auth,/\.\/vendor\/supabase-js\.js/);assert.match(auth,/\.\/config\.js/);assert.match(auth,/\.\/auth-session\.js/);assert.doesNotMatch(auth,/localStorage\.setItem/);assert.equal(fs.existsSync("vendor/supabase-js.js"),true);
  assert.match(bundle,/"Content-Type":"text\/plain"/);assert.doesNotMatch(bundle,/cache:"no-store"/);
});
test("patient chrome follows the clinic homepage without the ECG logo",()=>{
  const client=fs.readFileSync("patient-source/patient-app/client.tsx","utf8"),chrome=fs.readFileSync("patient-source/patient-app/chrome.tsx","utf8"),css=fs.readFileSync("patient-source/patient-app/patient.css","utf8");
  assert.match(chrome,/분당서울대학교병원 기분장애클리닉/);assert.match(chrome,/clinic-nav/);assert.match(chrome,/clinic-menu-toggle/);assert.match(chrome,/<Menu size=\{28\}/);assert.match(chrome,/clinic-mobile-menu/);
  assert.doesNotMatch(chrome,/Activity/);assert.doesNotMatch(client,/self-brand|self-header/);assert.doesNotMatch(css,/brand-symbol|self-brand/);
  assert.match(css,/\.clinic-header/);assert.match(css,/#172d76/);assert.match(css,/\.clinic-mobile-menu\.is-open/);
});
