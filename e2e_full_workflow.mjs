
import fs from 'node:fs';
import { SURVEY_SECTIONS } from './questions.js';
import { calculateScores, generateReport } from './scoring.js';

const cfg = fs.readFileSync('./config.js','utf8');
const SUPABASE_URL = cfg.match(/SUPABASE_URL = ENV\.VITE_SUPABASE_URL \|\| "([^"]+)"/)[1];
const SUPABASE_ANON_KEY = cfg.match(/SUPABASE_ANON_KEY = ENV\.VITE_SUPABASE_ANON_KEY \|\| "([^"]+)"/)[1];
const WEBHOOK_URL = cfg.match(/GOOGLE_SHEETS_WEBHOOK_URL = ENV\.GOOGLE_SHEETS_WEBHOOK_URL \|\| "([^"]+)"/)[1];
const HDR = {'apikey': SUPABASE_ANON_KEY, 'Content-Type':'application/json'};
const ADMIN_EMAIL = 'snumood@gmail.com';
const ADMIN_PASSWORD = process.env.MSSI_ADMIN_PASSWORD;
const HCODE = 'JWEY6A';
const nowTag = new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
const results = {started:new Date().toISOString(), config:{key_len:SUPABASE_ANON_KEY.length,key_dots:(SUPABASE_ANON_KEY.match(/\./g)||[]).length,key_ellipsis:SUPABASE_ANON_KEY.includes('...')}, checks:[], cases:[]};
function add(name, ok, detail={}) { results.checks.push({name, ok, ...detail}); console.log(`${ok?'PASS':'FAIL'} ${name}`, JSON.stringify(detail).slice(0,300)); if(!ok) process.exitCode=1; }
async function sfetch(path, opts={}) { return fetch(SUPABASE_URL+path, opts); }
async function auth(email,password) {
  const r=await sfetch('/auth/v1/token?grant_type=password',{method:'POST',headers:HDR,body:JSON.stringify({email,password})});
  const text=await r.text(); let j={}; try{j=JSON.parse(text)}catch{}
  return {ok:r.status===200,status:r.status,json:j,text};
}
async function signup(email,password,data) {
  const r=await sfetch('/auth/v1/signup',{method:'POST',headers:HDR,body:JSON.stringify({email,password,data})});
  const text=await r.text(); let j={}; try{j=JSON.parse(text)}catch{}
  return {ok:[200,201].includes(r.status),status:r.status,json:j,text};
}
async function rest(path, token, opts={}) {
  const headers={...HDR, Authorization:'Bearer '+token, ...(opts.headers||{})};
  const r=await sfetch('/rest/v1/'+path,{...opts,headers});
  const text=await r.text(); let j=null; try{j=JSON.parse(text)}catch{j=text}
  return {status:r.status, ok:r.status>=200&&r.status<300, json:j, text};
}
function chooseVal(opts, mode='mid') {
  if (!opts || !opts.length) return 1;
  if (mode==='min') return opts[0].v ?? opts[0];
  if (mode==='max') return opts[opts.length-1].v ?? opts[opts.length-1];
  return (opts[Math.floor(opts.length/2)].v ?? opts[Math.floor(opts.length/2)]);
}
function genAnswers(mode='full') {
  const a={};
  for (const section of SURVEY_SECTIONS) {
    const isPms = section.title.includes('PMS') || section.title.includes('생리주기');
    if (isPms) {
      a.pms_skip = mode==='pms_skip' ? 1 : 0;
      if (a.pms_skip===1) continue;
    }
    for (const q of section.questions) {
      if (q.type==='info') continue;
      if (section.id==='audit_k' && q.id!=='au1' && mode==='audit_skip') { a[q.id]=0; continue; }
      if (section.id==='audit_k' && q.id==='au1' && mode==='audit_skip') { a[q.id]=0; continue; }
      if (mode==='diag_skip') {
        if (['d1a','e1','f1','g1a','g3a','n1a'].includes(q.id)) { a[q.id]=0; continue; }
        if (['d1b','d2','e3','f3','f4','f6','g2','g5','n1b','n2','n3a','n3b','n3c','n3d','n3e','n3f'].includes(q.id)) { a[q.id]=0; continue; }
      }
      if (section.type === 'matrix_complex' && q.id !== 'mssi21') {
        const yes = mode==='low' ? 0 : 1;
        a[`${q.id}_yn`]=yes;
        if (yes) { a[`${q.id}_freq`]=chooseVal(section.options?.[0]?.opts,'mid'); a[`${q.id}_sev`]=chooseVal(section.options?.[1]?.opts,'mid'); }
        else { a[`${q.id}_freq`]=0; a[`${q.id}_sev`]=0; }
      } else if (q.type === 'matrix_months') {
        for (let r=0;r<q.rows.length;r++) a[`${q.id}_r${r}_m12`]=1;
      } else if (q.type === 'scale_matrix') {
        for (let r=0;r<q.rows.length;r++) a[`${q.id}_${r}`]=chooseVal(q.options,'mid');
      } else if (q.type === 'matrix_season_sleep') {
        for (let r=0;r<q.rows.length;r++) a[`${q.id}_${r}`]=7;
      } else if (q.type === 'custom_mdq') {
        for (const sq of q.questions) a[sq.id]=chooseVal(sq.options?.length?sq.options:[{v:1},{v:0}], mode==='low'?'min':'mid');
      } else if (q.type === 'yesno_with_sub') {
        a[q.id]=chooseVal(q.options, mode==='low'?'min':'mid');
        if (a[q.id] === 1 && q.subQuestion) a[q.subQuestion.id]=chooseVal(q.subQuestion.options, 'mid');
        else if (q.subQuestion) a[q.subQuestion.id]=0;
      } else {
        const opts=(section.type === 'matrix_complex' && q.id === 'mssi21') ? [{v:1},{v:0}] : (q.options || section.options || [{v:1},{v:0}]);
        a[q.id]=chooseVal(opts, mode==='low'?'min':'mid');
      }
    }
  }
  return a;
}
function validateAnswers(a) {
  const missing=[];
  for (const s of SURVEY_SECTIONS) {
    const isPms = s.title.includes('PMS') || s.title.includes('생리주기');
    if (isPms && a.pms_skip===1) continue;
    if (isPms && a.pms_skip===undefined) missing.push('pms_skip');
    for (const q of s.questions) {
      if(q.type==='info') continue;
      if (s.id==='audit_k' && q.id!=='au1' && a.au1===0) continue;
      if (['d1b','d2'].includes(q.id) && a.d1a===0) continue;
      if (['e3'].includes(q.id) && a.e1===0) continue;
      if (['f3','f4','f6'].includes(q.id) && a.f1===0) continue;
      if (q.id === 'g2' && a.g1a!==1) continue;
      if (q.id === 'g3a' && a.g1a===undefined) continue;
      if (q.id === 'g5' && !(a.g2===1 || a.g3a===1)) continue;
      if (['n1b','n2','n3a','n3b','n3c','n3d','n3e','n3f'].includes(q.id) && a.n1a===0) continue;
      if (s.type==='matrix_complex' && q.id!=='mssi21') { if(a[`${q.id}_yn`]===undefined || (a[`${q.id}_yn`]===1 && (a[`${q.id}_freq`]===undefined||a[`${q.id}_sev`]===undefined))) missing.push(q.id); }
      else if(q.type==='matrix_months') {}
      else if(q.type==='scale_matrix') { for(let r=0;r<q.rows.length;r++) if(a[`${q.id}_${r}`]===undefined) missing.push(q.id); }
      else if(q.type==='matrix_season_sleep') { for(let r=0;r<q.rows.length;r++) if(a[`${q.id}_${r}`]===undefined) missing.push(q.id); }
      else if(q.type==='custom_mdq') { for(const sq of q.questions) if(a[sq.id]===undefined) missing.push(sq.id); }
      else if(q.type==='yesno_with_sub') { if(a[q.id]===undefined || (a[q.id]===1 && a[q.subQuestion.id]===undefined)) missing.push(q.id); }
      else if(a[q.id]===undefined) missing.push(q.id);
    }
  }
  return missing;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function postWebhookWithRetry(payload, attempts = 3) {
  let status = 0;
  let text = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const wh = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      status = wh.status;
      text = (await wh.text()).slice(0, 200);
      if (status >= 200 && status < 400) return { status, text, attempt };
    } catch (e) {
      text = String(e).slice(0, 200);
    }
    if (attempt < attempts) await sleep(1500 * attempt);
  }
  return { status, text, attempt: attempts };
}

add('deployed_config_shape_local', results.config.key_len>30 && !results.config.key_ellipsis && (results.config.key_dots===2 || SUPABASE_ANON_KEY.startsWith('sb_publishable_')), results.config);
let r=await fetch(SUPABASE_URL+'/rest/v1/profiles?select=id,role,hospital_code&limit=1',{headers:HDR});
add('anon_profiles_probe', r.status===200, {http:r.status});
if (ADMIN_PASSWORD) {
  const adm=await auth(ADMIN_EMAIL, ADMIN_PASSWORD);
  add('admin_login', adm.ok, {http:adm.status, user:adm.json?.user?.id?.slice?.(0,8)});
  if (adm.ok) {
    const ar=await rest('profiles?select=id,email,role,hospital_code&limit=5', adm.json.access_token);
    add('admin_profiles_read', ar.ok, {http:ar.status, rows:Array.isArray(ar.json)?ar.json.length:null});
  }
} else add('admin_login_skipped_no_password_env', true);

const cases=['full','audit_skip','pms_skip','diag_skip','low'];
let idx=0;
for (const mode of cases) {
  idx++;
  const uid=`hyj-${mode}-${nowTag}-${idx}`.toLowerCase();
  const email=`${uid}@patient.local`; const pw='MssiE2E!2026'; const pnum=`HYJ-${nowTag}-${idx}`;
  const su=await signup(email,pw,{role:'patient', username:uid, patient_number:pnum, hospital_code:HCODE, dob:'1990-06'});
  const au=su.json?.access_token ? {ok:true,status:200,json:su.json} : await auth(email,pw);
  const token=au.json?.access_token; const userId=au.json?.user?.id || su.json?.user?.id;
  const c={mode,email,pnum,signup:su.status,login:au.status};
  if (!su.ok || !au.ok || !token) { c.ok=false; c.error='auth'; results.cases.push(c); add(`case_${mode}_auth`,false,c); continue; }
  const prof=await rest(`profiles?select=id,role,hospital_code,patient_number&eq=id.${userId}`, token);
  // PostgREST syntax fix: use query manually if first failed
  const prof2=await rest(`profiles?select=id,role,hospital_code,patient_number&id=eq.${userId}`, token);
  c.profile_http=prof2.status; c.profile_role=Array.isArray(prof2.json)&&prof2.json[0]?.role;
  const answers=genAnswers(mode); const missing=validateAnswers(answers); c.answer_keys=Object.keys(answers).length; c.missing=missing.length;
  const scores=calculateScores(answers); const report=generateReport(scores,answers);
  const ins=await rest('survey_responses', token, {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify({patient_id:userId,patient_user_id:userId,hospital_code:HCODE,patient_number:pnum,status:'completed',completed:true,answers,scores,report,completed_at:new Date().toISOString()})});
  c.insert_http=ins.status; c.response_id=Array.isArray(ins.json)?ins.json[0]?.id:null;
  const read= c.response_id ? await rest(`survey_responses?select=id,status,completed,patient_number,scores&id=eq.${c.response_id}`, token) : {status:0,json:[]};
  c.verify_http=read.status; c.verified=Array.isArray(read.json)&&read.json.length===1&&read.json[0].status==='completed';
  // Real webhook payload, same shape as submitSurvey. Browser uses no-cors + text/plain
  // to avoid Apps Script CORS preflight; Node mirrors the content type for parity.
  const gsPayload={
    timestamp:new Date().toISOString(), responseId:c.response_id || '', patientId:userId,
    dob:'1990-06', hospitalCode:HCODE, patientNumber:pnum,
    doctorNickname:'', hospitalNickname:'', answers, scores, report,
    scoresJson:JSON.stringify(scores), reportJson:JSON.stringify(report)
  };
  const whResult = await postWebhookWithRetry(gsPayload);
  c.webhook_http=whResult.status; c.webhook_body=whResult.text; c.webhook_attempt=whResult.attempt;
  c.ok=su.ok&&au.ok&&prof2.ok&&missing.length===0&&ins.ok&&c.verified&&(whResult.status>=200&&whResult.status<400);
  results.cases.push(c);
  add(`case_${mode}_full_submit`, c.ok, {signup:c.signup,login:c.login,profile:c.profile_http,keys:c.answer_keys,missing:c.missing,insert:c.insert_http,verify:c.verify_http,webhook:c.webhook_http,response_id:c.response_id});
}
fs.writeFileSync('./mssi_e2e_full_report.json', JSON.stringify(results,null,2));
console.log('REPORT ./mssi_e2e_full_report.json');
