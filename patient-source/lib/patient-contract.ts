import {type Entry} from "./clinical.ts";

export const ACCOUNT_SHEET="로그인설문";
export const ACCOUNT_HEADERS=["request_id","timestamp","user_id","hospital_code","patient_number","kind","total_score","answers_json","schema_version"];
export type SurveyKind="mssi"|"lifestyle";
export type MssiAnswer={gate:number;frequency:number;severity:number};
export type SurveyAnswers={items:number[]}|{items:MssiAnswer[];q21:number};
export class PatientError extends Error {constructor(public code:string,message:string){super(message);}}
const invalid=()=>new PatientError("INVALID_ANSWERS","모든 문항의 응답을 확인해 주세요.");
export function validateAnswers(kind:unknown,raw:unknown):{kind:SurveyKind;answers:SurveyAnswers;score:number}{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw invalid();
  const value=raw as Record<string,unknown>;
  if(!Array.isArray(value.items))throw invalid();
  if(kind==="lifestyle"){
    const allowed=[[0,10,20,40],[0,5,10,20],[0,2,5,10],...Array.from({length:6},()=>[0,1,3,5])];
    if(Object.keys(value).some(k=>k!=="items")||value.items.length!==9||value.items.some((v,i)=>typeof v!=="number"||!allowed[i].includes(v)))throw invalid();
    const items=value.items as number[];return{kind,answers:{items},score:items.reduce((a,b)=>a+b,0)};
  }
  if(kind!=="mssi"||Object.keys(value).some(k=>!["items","q21"].includes(k))||value.items.length!==20||![0,1].includes(value.q21 as number))throw invalid();
  const items=value.items.map((v:unknown)=>{
    if(!v||typeof v!=="object"||Array.isArray(v))throw invalid();
    const a=v as Record<string,unknown>;
    if(Object.keys(a).some(k=>!["gate","frequency","severity"].includes(k))||![0,1].includes(a.gate as number))throw invalid();
    if(a.gate===0){if(a.frequency!==0||a.severity!==0)throw invalid();return{gate:0,frequency:0,severity:0};}
    if(![1,2,3,4].includes(a.frequency as number)||![1,2,3].includes(a.severity as number))throw invalid();
    return{gate:1,frequency:a.frequency as number,severity:a.severity as number};
  });
  return{kind,answers:{items,q21:value.q21 as number},score:items.reduce((sum,a)=>sum+a.frequency*a.severity,0)};
}
export function accountRowToEntry(row:unknown[],ownerId?:string):Entry|null{
  if(row[8]!==1&&row[8]!=="1")return null;
  if(ownerId&&row[2]!==ownerId)return null;
  try{
    if(typeof row[1]!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(row[1])||!Number.isFinite(Date.parse(row[1])))return null;
    const result=validateAnswers(row[5],JSON.parse(String(row[7])));
    const base={id:`account:${row[0]}`,kind:result.kind,date:row[1],score:result.score,warnings:Number(row[6])===result.score?[]:["저장 총점과 문항 합계가 다릅니다. 문항 합계를 표시합니다."],source:ACCOUNT_SHEET};
    if(result.kind==="lifestyle")return{...base,items:result.answers.items as number[]};
    const a=result.answers as {items:MssiAnswer[];q21:number};
    return{...base,items:a.items.map(v=>v.frequency*v.severity),gates:a.items.map(v=>v.gate),frequencies:a.items.map(v=>v.frequency),severities:a.items.map(v=>v.severity),q21:a.q21};
  }catch{return null;}
}
