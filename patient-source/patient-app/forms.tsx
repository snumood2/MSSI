import {useState,useRef} from "react";
import {LIFE_LABELS} from "../lib/clinical";
import {QUESTIONS} from "./questions";
import {RadioGroup,RadioGroupItem} from "../components/ui/radio-group";
import {type SurveyKind,type SurveyAnswers,validateAnswers} from "../lib/patient-contract";
const frequencies=["1일 미만(몇 시간 지속)","1일 이상 1주 미만","1주 이상 2주 미만","매일 증상이 있었다"];
const severities=["약간 (증상은 있었지만 힘들지 않았다)","상당히 (매우 불쾌하지만 참을 수 있었다)","심하게 (정말 견디기 힘들었다)"];
function Choices({name,options,value,onChange,disabled}:{name:string;options:{value:number;label:string}[];value:number|null;onChange:(v:number)=>void;disabled:boolean}){
  return <RadioGroup aria-label={name} value={value===null?"":String(value)} onValueChange={v=>onChange(Number(v))} disabled={disabled} className="survey-options">{options.map(o=><label className={`survey-choice ${value===o.value?"checked":""}`} key={o.value}><RadioGroupItem value={String(o.value)} aria-label={o.label}/><span>{o.label}</span></label>)}</RadioGroup>;
}
export default function PatientForm({kind,submit}:{kind:SurveyKind;submit:(kind:SurveyKind,answers:SurveyAnswers,requestId:string)=>Promise<void>}){
  const [life,setLife]=useState<(number|null)[]>(Array(9).fill(null)),[mssi,setMssi]=useState(Array.from({length:20},()=>({gate:null as number|null,frequency:null as number|null,severity:null as number|null}))),[q21,setQ21]=useState<number|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const pending=useRef<{key:string;signature:string}|null>(null);
  const completed=kind==="lifestyle"?life.filter(v=>v!==null).length:mssi.filter(v=>v.gate===0||(v.gate===1&&v.frequency!==null&&v.severity!==null)).length+(q21===null?0:1),total=kind==="lifestyle"?9:21;
  function update(index:number,field:"gate"|"frequency"|"severity",value:number){setMssi(old=>old.map((item,i)=>i!==index?item:field==="gate"?{gate:value,frequency:value===0?0:null,severity:value===0?0:null}:{...item,[field]:value}));}
  async function send(e:React.FormEvent){
    e.preventDefault();if(busy)return;setError("");
    if(completed!==total){setError("아직 답하지 않은 문항이 있어요. 모든 문항을 확인해 주세요.");return;}
    try{
      const result=validateAnswers(kind,kind==="lifestyle"?{items:life}:{items:mssi,q21});
      const signature=JSON.stringify(result.answers);if(!pending.current||pending.current.signature!==signature)pending.current={key:crypto.randomUUID(),signature};
      setBusy(true);await submit(kind,result.answers,pending.current.key);pending.current=null;
    }catch(err){setError(err instanceof Error?err.message:"저장을 완료하지 못했습니다. 다시 시도해 주세요.");}finally{setBusy(false);}
  }
  return <form className="patient-form" onSubmit={send}><div className="patient-section-heading"><div><span className="eyebrow">CHECK IN WITH YOURSELF</span><h1>{kind==="lifestyle"?"나의 생활습관":"나의 기분안정성"}</h1><p>{kind==="lifestyle"?"지난 한 달을 돌아보며 솔직하게 체크해주세요.":"최근 2주 동안의 모습을 돌아보세요. 증상이 있었다면 빈도와 심한 정도도 표시해 주세요."}</p></div></div><div className="survey-progress"><span>내 계정에 자동으로 연결됩니다.</span><strong>{completed} / {total}</strong><div><span style={{width:`${completed/total*100}%`}}/></div></div>
    {kind==="lifestyle"?LIFE_LABELS.map((label,i)=><fieldset className="survey-card" key={label}><legend><span>{String(i+1).padStart(2,"0")}</span>{label}</legend>{i===6&&<p className="survey-context">과소비, 도박, 과도한 활동, 폭식, 약물 남용 등</p>}<Choices name={`${i+1}. ${label}`} options={QUESTIONS.life[i]} value={life[i]} onChange={v=>setLife(old=>old.map((a,j)=>j===i?v:a))} disabled={busy}/></fieldset>):<>{QUESTIONS.mssi.map((question,i)=><fieldset className="survey-card" key={question}><legend><span>{String(i+1).padStart(2,"0")}</span>{question}</legend><Choices name={`${i+1}번 증상 유무`} options={[{value:0,label:"아니오"},{value:1,label:"예"}]} value={mssi[i].gate} onChange={v=>update(i,"gate",v)} disabled={busy}/>{mssi[i].gate===1&&<div className="survey-subquestions"><h3>A. 얼마나 자주 있었습니까?</h3><Choices name={`${i+1}번 빈도`} options={frequencies.map((label,v)=>({label,value:v+1}))} value={mssi[i].frequency} onChange={v=>update(i,"frequency",v)} disabled={busy}/><h3>B. 얼마나 심했습니까?</h3><Choices name={`${i+1}번 심한 정도`} options={severities.map((label,v)=>({label,value:v+1}))} value={mssi[i].severity} onChange={v=>update(i,"severity",v)} disabled={busy}/></div>}</fieldset>)}<fieldset className="survey-card"><legend><span>21</span>우울하더라도 행동이 느려지진 않았다.</legend><Choices name="21번 응답" options={[{value:0,label:"아니오 (느려졌다)"},{value:1,label:"예 (느려지지 않았다)"}]} value={q21} onChange={setQ21} disabled={busy}/></fieldset></>}
    {error&&<div className="error-banner" role="alert">{error}</div>}<button className="survey-submit" type="submit" disabled={busy}>{busy?"안전하게 저장하고 있어요…":"저장하고 나의 변화 보기"}</button><p className="patient-disclaimer">답변은 담당 의료진이 확인할 수 있습니다. 저장 완료 전에 창을 닫으면 작성 중인 응답은 보관되지 않습니다.</p>
  </form>;
}
