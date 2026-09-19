export const MSSI_LABELS = ["감정 기복", "기분 불안정", "다툼", "화·짜증", "눈물·울음", "쉽게 흥분", "들뜬 기분", "평안하지 않음", "불안·초조", "갑작스러운 에너지", "말이 많고 빨라짐", "생각으로 인한 불면", "이어지는 생각", "의기양양·과대한 기분", "긴장", "밤샘·늦은 취침", "해로운 일에 몰입", "죽고 싶다는 생각", "모든 일을 그만두고 싶음", "자해하고 싶은 생각"];
export const LIFE_LABELS = ["꾸준한 약물 복용", "규칙적인 수면", "꾸준한 운동", "햇빛 보기", "음주 피하기", "대인관계 관리", "무리한 일 피하기", "기분 관찰하기", "스스로 아껴 주기"];
export const LIFE_MAX = [40,20,10,5,5,5,5,5,5];
export type Entry = { id: string; kind: "mssi" | "lifestyle"; date: string; score: number | null; items: (number | null)[]; gates?: (number | null)[]; frequencies?: (number | null)[]; severities?: (number | null)[]; q21?: number | null; warnings: string[]; source: string };
export type Patient = { patientId:string; entries:Entry[]; fetchedAt:string; demo?:boolean; warnings?:string[] };
export function dateLabel(date:string, withYear=false) { return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",...(withYear?{year:"numeric"}:{}),month:"2-digit",day:"2-digit"}).format(new Date(date)); }
export function normalizeId(value:unknown):string { return String(value??"").trim(); }
export function periodStart(lastTime:number,months:number,firstTime:number):number {
  if(months===0)return firstTime;
  const kst=new Date(lastTime+9*3600000),target=new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth()-months,1));
  const day=Math.min(kst.getUTCDate(),new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate());
  return Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),day)-9*3600000;
}
export function parseChoice(value:unknown):number|null {
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  const m=String(value??"").trim().match(/^\(?(-?\d+(?:\.\d+)?)\)?(?:[.\s]|$)/);return m?Number(m[1]):null;
}
export function parseDate(value:unknown):string|null {
  if(typeof value==="number"&&value>20000&&value<100000)return new Date(Math.round((value-25569)*86400000)-9*3600000).toISOString();
  const s=String(value??"").trim(),m=s.match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?\s*(?:(오전|오후)\s*)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){let h=Number(m[5]||0);if(m[4])h=h%12+(m[4]==="오후"?12:0);const mon=Number(m[2]),d=Number(m[3]);if(mon<1||mon>12||d<1||d>new Date(Number(m[1]),mon,0).getDate()||h>23||Number(m[6]||0)>59||Number(m[7]||0)>59)return null;return new Date(`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}T${String(h).padStart(2,"0")}:${m[6]||"00"}:${m[7]||"00"}+09:00`).toISOString();}
  if(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(s)){const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString();}return null;
}
export function parseRows(rows:unknown[][],kind:Entry["kind"],patientId:string,source:string):{entries:Entry[];rejected:number}{
  const entries:Entry[]=[];let rejected=0;
  for(let n=1;n<rows.length;n++){const row=rows[n];if(normalizeId(row[1])!==patientId)continue;const date=parseDate(row[0]);if(!date){rejected++;continue;}const warnings:string[]=[];
    if(kind==="lifestyle"){
      const allowed=[[0,10,20,40],[0,5,10,20],[0,2,5,10],...Array.from({length:6},()=>[0,1,3,5])];
      const items=LIFE_MAX.map((_,i)=>{const v=parseChoice(row[i+3]);return v!==null&&allowed[i].includes(v)?v:null;});
      const score=items.every(v=>v!==null)?items.reduce<number>((a,v)=>a+(v??0),0):null,saved=parseChoice(row[2]);
      if(score===null)warnings.push("일부 생활습관 응답이 누락되었거나 범위를 벗어났습니다.");
      if(saved!==null&&score!==null&&saved!==score)warnings.push(`저장 총점 ${saved}점과 문항 합계 ${score}점이 다릅니다. 문항 합계를 표시합니다.`);
      entries.push({id:`${source}:${n+1}`,kind,date,score,items,warnings,source});
    }else{
      const gates:(number|null)[]=[],frequencies:(number|null)[]=[],severities:(number|null)[]=[],items:(number|null)[]=[];
      for(let i=0;i<20;i++){const g=parseChoice(row[2+i*3]),f=parseChoice(row[3+i*3]),s=parseChoice(row[4+i*3]);gates.push(g===0||g===1?g:null);frequencies.push(g===0?0:f);severities.push(g===0?0:s);items.push(g===0?0:g===1&&f!==null&&s!==null&&[1,2,3,4].includes(f)&&[1,2,3].includes(s)?f*s:null);}
      const score=items.every(v=>v!==null)?items.reduce<number>((a,v)=>a+(v??0),0):null,saved=parseChoice(row[63]),q21=parseChoice(row[62]);
      if(score===null)warnings.push("일부 MSSI 응답이 누락되었거나 범위를 벗어나 총점을 계산하지 않았습니다.");
      if(score!==null&&saved!==null&&saved!==score)warnings.push(`저장 총점 ${saved}점과 문항 합계 ${score}점이 다릅니다. 문항 합계를 표시합니다.`);
      entries.push({id:`${source}:${n+1}`,kind,date,score,items,gates,frequencies,severities,q21:q21===0||q21===1?q21:null,warnings,source});
    }
  }return{entries,rejected};
}
export function mergeEntries(entries:Entry[]):Entry[]{const seen=new Set<string>();return entries.sort((a,b)=>a.date.localeCompare(b.date)).filter(e=>{const key=JSON.stringify([e.kind,e.date,e.items,e.gates,e.frequencies,e.severities,e.q21]);if(seen.has(key))return false;seen.add(key);return true;});}
export const DEMO_ID="DEMO-001";
export function demoPatient():Patient{
  const lifestyles=[[20,5,2,1,3,1,3,1,1],[20,10,2,3,3,3,3,1,3],[40,10,2,3,5,3,3,3,3],[40,10,5,3,5,3,3,3,3],[40,20,5,5,5,3,3,3,3],[40,10,5,3,5,3,3,3,3],[40,20,5,5,5,3,5,3,3],[40,20,5,5,5,5,5,3,3]];
  const symptoms=[[6,6,3,6,4,3,3,4,6,2,2,6,6,0,6,4,1,0,3,0],[6,6,2,4,3,2,2,4,4,2,2,6,4,0,4,4,1,0,2,0],[4,4,1,4,2,2,2,3,4,1,1,4,4,0,4,3,0,0,2,0],[4,3,1,3,2,2,1,2,3,1,1,4,3,0,3,2,0,0,1,0],[3,3,0,2,1,1,1,2,2,1,1,3,2,0,2,2,0,0,1,0],[4,4,1,4,2,2,1,3,4,1,1,4,3,0,4,3,0,0,2,0],[2,2,0,2,1,1,0,1,2,0,0,2,2,0,2,1,0,0,1,0],[2,1,0,1,1,0,0,1,1,0,0,2,1,0,1,1,0,0,1,0]];
  const days=["02-06","03-06","04-03","05-08","06-05","07-03","08-07","09-04"],entries:Entry[]=[];
  days.forEach((d,i)=>{const f=symptoms[i].map(v=>v===6?3:v===4?2:v),s=symptoms[i].map(v=>v>=4?2:v?1:0);entries.push({id:`demo-m-${i}`,kind:"mssi",date:`2026-${d}T00:10:00.000Z`,items:symptoms[i],score:symptoms[i].reduce((a,b)=>a+b,0),frequencies:f,severities:s,q21:1,gates:symptoms[i].map(v=>v?1:0),warnings:[],source:"가상 예시"});entries.push({id:`demo-l-${i}`,kind:"lifestyle",date:`2026-${d}T00:00:00.000Z`,items:lifestyles[i],score:lifestyles[i].reduce((a,b)=>a+b,0),warnings:[],source:"가상 예시"});});
  return{patientId:DEMO_ID,entries:mergeEntries(entries),fetchedAt:"2026-09-19T00:00:00Z",demo:true};
}
