import React,{useState,useEffect,useCallback} from "react";
import {createRoot} from "react-dom/client";
import {Activity,Leaf,ChartNoAxesCombined,LogOut,ArrowLeft,RefreshCw} from "lucide-react";
import {type Patient} from "../lib/clinical";
import {type SurveyAnswers,type SurveyKind} from "../lib/patient-contract";
import PatientHistory from "./history";
import PatientForm from "./forms";
declare const PATIENT_API_URL:string;
declare global {interface Window{clinicAuth:{session:()=>Promise<{access_token:string;user:{id:string}}|null>;signOut:()=>Promise<void>;onSignOut:(callback:()=>void)=>()=>void}}}
type View="history"|SurveyKind;
type ApiResult={ok:boolean;code?:string;message?:string;patient?:Patient};
const readView=():View=>{const v=new URLSearchParams(location.search).get("view");return v==="mssi"||v==="lifestyle"?v:"history";};
function App(){
  const [view,setView]=useState<View>(readView),[patient,setPatient]=useState<Patient|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const request=useCallback(async(payload:object)=>{
    const session=await window.clinicAuth.session();if(!session){location.replace(`login-snubh01.html?next=${readView()}`);throw new Error("로그인해 주세요.");}
    const response=await fetch(PATIENT_API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,accessToken:session.access_token}),credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"});
    if(!response.ok)throw new Error("연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.");
    const result=await response.json() as ApiResult;
    const latest=await window.clinicAuth.session();if(!latest||latest.user.id!==session.user.id)throw new Error("로그인 계정이 변경되었습니다. 새로고침해 주세요.");
    if(!result.ok){if(result.code==="UNAUTHORIZED")location.replace(`login-snubh01.html?next=${readView()}`);throw new Error(result.message||"기록을 불러오지 못했습니다.");}return result;
  },[]);
  const reload=useCallback(async()=>{setLoading(true);setError("");setPatient(null);try{const result=await request({action:"history"});if(!result.patient)throw new Error("기록 응답을 확인하지 못했습니다.");setPatient(result.patient);}catch(e){setError(e instanceof Error?e.message:"연결을 확인해 주세요.");}finally{setLoading(false);}},[request]);
  useEffect(()=>{let alive=true;void request({action:"history"}).then(result=>{if(alive){if(!result.patient)throw new Error("기록을 확인하지 못했습니다.");setPatient(result.patient);}}).catch(e=>{if(alive)setError(e instanceof Error?e.message:"연결을 확인해 주세요.");}).finally(()=>{if(alive)setLoading(false);});const unsubscribe=window.clinicAuth.onSignOut(()=>{alive=false;setPatient(null);location.replace("login-snubh01.html");});return()=>{alive=false;unsubscribe();};},[request]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(view!=="history"){e.preventDefault();}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[view]);
  function navigate(next:View){if(next===view)return;if(view!=="history"&&!confirm("작성 중인 응답은 저장되지 않습니다. 이동할까요?"))return;setNotice("");setView(next);history.replaceState(null,"",`?view=${next}`);window.scrollTo(0,0);}
  async function submit(kind:SurveyKind,answers:SurveyAnswers,requestId:string){await request({action:"submit",kind,answers,requestId});setView("history");history.replaceState(null,"","?view=history");setNotice("기록이 저장되었어요.");await reload();window.scrollTo(0,0);}
  return <div className="self-app"><header className="self-header"><a className="self-brand" href="patient.html"><span><Activity size={22}/></span><strong>SNUMOOD<small>나의 기분과 생활</small></strong></a><div><a className="self-back" href="respondent.html"><ArrowLeft size={15}/>기존 설문·결과</a><button aria-label="로그아웃" onClick={()=>void window.clinicAuth.signOut()}><LogOut size={17}/><span>로그아웃</span></button></div></header><div className="self-body"><nav className="self-tabs" aria-label="나의 기록 메뉴">{([{value:"history",label:"나의 변화",icon:ChartNoAxesCombined},{value:"lifestyle",label:"생활습관 기록",icon:Leaf},{value:"mssi",label:"기분안정성 기록",icon:Activity}] as const).map(v=><button key={v.value} aria-current={view===v.value?"page":undefined} onClick={()=>navigate(v.value)}><v.icon size={18}/>{v.label}</button>)}</nav>{notice&&<div className="self-success" role="status">{notice}</div>}{error&&<div className="error-banner" role="alert"><span>{error}</span><button onClick={()=>void reload()}>다시 시도</button></div>}{loading?<div className="empty-panel" role="status"><RefreshCw className="spinning" size={30}/><p>나의 기록을 확인하고 있어요.</p></div>:patient?view==="history"?<PatientHistory patient={patient} reload={()=>void reload()} busy={loading}/>:<PatientForm kind={view} key={view} submit={submit}/>:null}<footer className="self-footer">분당서울대학교병원 기분장애클리닉</footer></div></div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
