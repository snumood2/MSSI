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
  assert.match(html,/patient-auth\.js\?v=patient-api-20260922/);assert.match(html,/connect-src[^\"]*https:\/\/script\.google\.com[^\"]*https:\/\/script\.googleusercontent\.com/);assert.match(auth,/patient-bundle\.js\?v=patient-api-20260922/);assert.match(auth,/\.\/vendor\/supabase-js\.js/);assert.match(auth,/\.\/config\.js/);assert.match(auth,/\.\/auth-session\.js/);assert.doesNotMatch(auth,/localStorage\.setItem/);assert.equal(fs.existsSync("vendor/supabase-js.js"),true);
  assert.match(bundle,/"Content-Type":"text\/plain"/);assert.doesNotMatch(bundle,/cache:"no-store"/);
});
