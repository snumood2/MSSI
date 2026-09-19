import {ACCOUNT_SHEET,ACCOUNT_HEADERS,PatientError,validateAnswers,accountRowToEntry} from "../lib/patient-contract.ts";
declare const PATIENT_SUPABASE_URL:string;
declare const PATIENT_SUPABASE_ANON_KEY:string;
type Profile={id:string;role:string;hospital_code:string;patient_number:string};
type Range={getValues:()=>unknown[][];setValues:(v:unknown[][])=>unknown;setNumberFormat:(format:string)=>Range};
type Sheet={getLastRow:()=>number;getRange:(row:number,col:number,rows:number,cols:number)=>Range;setFrozenRows:(rows:number)=>unknown};
declare const SpreadsheetApp:{openById:(id:string)=>{getSheetByName:(name:string)=>Sheet|null;insertSheet:(name:string)=>Sheet};flush:()=>void};
declare const UrlFetchApp:{fetch:(url:string,options:object)=>{getResponseCode:()=>number;getContentText:()=>string}};
declare const LockService:{getScriptLock:()=>{tryLock:(ms:number)=>boolean;releaseLock:()=>void}};
declare const ContentService:{MimeType:{JSON:string};createTextOutput:(s:string)=>{setMimeType:(mime:string)=>unknown}};
const SHEET_ID="1w6lMOTlXJQgF8qkc98j0MfzzCpNIGFnwFDHJhvwtGp4";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function json(value:unknown){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function authorizedProfile(token:unknown):Profile{
  if(typeof token!=="string"||token.length<40||token.length>8192||/[\r\n\s]/.test(token))throw new PatientError("UNAUTHORIZED","다시 로그인해 주세요.");
  const headers={apikey:PATIENT_SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`};
  const userResponse=UrlFetchApp.fetch(`${PATIENT_SUPABASE_URL}/auth/v1/user`,{headers,muteHttpExceptions:true,followRedirects:false});
  if(userResponse.getResponseCode()!==200)throw new PatientError("UNAUTHORIZED","로그인이 만료되었습니다. 다시 로그인해 주세요.");
  const user=JSON.parse(userResponse.getContentText());
  if(typeof user.id!=="string"||!uuid.test(user.id)||user.is_anonymous)throw new PatientError("UNAUTHORIZED","환자 계정으로 로그인해 주세요.");
  // Identity comes from GoTrue, never from request fields, JWT decoding or user_metadata.
  const response=UrlFetchApp.fetch(`${PATIENT_SUPABASE_URL}/rest/v1/profiles?select=id,role,hospital_code,patient_number&id=eq.${encodeURIComponent(user.id)}`,{headers,muteHttpExceptions:true,followRedirects:false});
  if(response.getResponseCode()!==200)throw new PatientError("FORBIDDEN","계정 정보를 확인하지 못했습니다.");
  const profiles=JSON.parse(response.getContentText()),p=profiles[0];
  if(profiles.length!==1||p.id!==user.id||p.role!=="patient"||p.hospital_code!=="SNUBH01"||!/^\d{8}$/.test(p.patient_number))throw new PatientError("FORBIDDEN","분당서울대학교병원 환자 계정으로 이용해 주세요.");
  return p;
}
function sheet(create=false):Sheet|null{
  const book=SpreadsheetApp.openById(SHEET_ID);let tab=book.getSheetByName(ACCOUNT_SHEET);
  if(!tab&&create){tab=book.insertSheet(ACCOUNT_SHEET);tab.getRange(1,1,1,ACCOUNT_HEADERS.length).setValues([ACCOUNT_HEADERS]);tab.setFrozenRows(1);}
  if(tab&&JSON.stringify(tab.getRange(1,1,1,ACCOUNT_HEADERS.length).getValues()[0])!==JSON.stringify(ACCOUNT_HEADERS))throw new Error("Account sheet schema mismatch");
  return tab;
}
function ownRows(tab:Sheet|null,uid:string):unknown[][]{
  if(!tab||tab.getLastRow()<2)return[];
  const ids=tab.getRange(2,3,tab.getLastRow()-1,1).getValues();
  return ids.flatMap((r,i)=>r[0]===uid?[tab.getRange(i+2,1,1,ACCOUNT_HEADERS.length).getValues()[0]]:[]);
}
function history(profile:Profile){
  const records=ownRows(sheet(),profile.id),entries=records.map(r=>accountRowToEntry(r,profile.id)).filter(e=>e!==null).sort((a,b)=>a.date.localeCompare(b.date));
  return{patientId:profile.patient_number,entries,fetchedAt:new Date().toISOString(),warnings:records.length===entries.length?[]:["일부 기록을 읽지 못했습니다. 담당자에게 문의해 주세요."]};
}
export function doGet(){return json({service:"snumood-patient-history",version:1,status:"ready",authentication:"Supabase patient session required"});}
export function doPost(event:{postData?:{contents?:string}}){
  try{
    const raw=event?.postData?.contents;
    if(!raw||raw.length>24000)throw new PatientError("BAD_REQUEST","요청을 확인해 주세요.");
    const request=JSON.parse(raw);
    if(!request||typeof request!=="object"||Array.isArray(request)||Object.keys(request).some(k=>!["action","accessToken","kind","answers","requestId"].includes(k)))throw new PatientError("BAD_REQUEST","요청을 확인해 주세요.");
    if(!["history","submit"].includes(request.action))throw new PatientError("BAD_REQUEST","지원하지 않는 요청입니다.");
    const profile=authorizedProfile(request.accessToken);
    if(request.action==="history")return json({ok:true,patient:history(profile)});
    const active=UrlFetchApp.fetch(`${PATIENT_SUPABASE_URL}/rest/v1/rpc/patient_can_use_hospital`,{method:"post",headers:{apikey:PATIENT_SUPABASE_ANON_KEY,Authorization:`Bearer ${request.accessToken}`},contentType:"application/json",payload:"{}",muteHttpExceptions:true,followRedirects:false});
    if(active.getResponseCode()!==200||JSON.parse(active.getContentText())!==true)throw new PatientError("FORBIDDEN","현재 설문 작성이 허용되지 않습니다. 담당자에게 문의해 주세요.");
    if(typeof request.requestId!=="string"||!uuid.test(request.requestId))throw new PatientError("BAD_REQUEST","제출 정보를 확인해 주세요.");
    const result=validateAnswers(request.kind,request.answers),serialized=JSON.stringify(result.answers),lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))throw new PatientError("BUSY","제출이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.");
    try{
      const tab=sheet(true)!;
      const existing=ownRows(tab,profile.id).find(row=>row[0]===request.requestId);
      if(existing){if(existing[5]!==result.kind||existing[7]!==serialized)throw new PatientError("CONFLICT","제출 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.");return json({ok:true,entry:accountRowToEntry(existing,profile.id),duplicate:true});}
      const row=[request.requestId,new Date().toISOString(),profile.id,profile.hospital_code,profile.patient_number,result.kind,result.score,serialized,1];
      tab.getRange(tab.getLastRow()+1,1,1,ACCOUNT_HEADERS.length).setNumberFormat("@").setValues([row]);SpreadsheetApp.flush();
      const saved=tab.getRange(tab.getLastRow(),1,1,ACCOUNT_HEADERS.length).getValues()[0];
      if(JSON.stringify(saved)!==JSON.stringify(row))throw new Error("Storage readback mismatch");
      return json({ok:true,entry:accountRowToEntry(saved,profile.id),duplicate:false});
    }finally{lock.releaseLock();}
  }catch(error){return json({ok:false,code:error instanceof PatientError?error.code:"SERVICE_ERROR",message:error instanceof PatientError?error.message:"처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."});}
}
