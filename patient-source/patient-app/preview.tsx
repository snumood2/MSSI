import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {demoPatient,type Patient} from "../lib/clinical";
import {accountRowToEntry,type SurveyKind,type SurveyAnswers,validateAnswers} from "../lib/patient-contract";
import PatientHistory from "./history";
import PatientForm from "./forms";
import {ClinicHeader,PatientNavigation,type PatientView} from "./chrome";

function Preview(){
  const [view,setView]=useState<PatientView>("history"),[patient,setPatient]=useState<Patient>(demoPatient);
  async function submit(kind:SurveyKind,answers:SurveyAnswers){
    const result=validateAnswers(kind,answers),entry=accountRowToEntry([crypto.randomUUID(),new Date().toISOString(),"preview","SNUBH01","DEMO",kind,result.score,JSON.stringify(result.answers),1])!;
    setPatient(current=>({...current,entries:[...current.entries,entry]}));
    setView("history");
  }
  return <div className="self-app">
    <ClinicHeader/>
    <div className="self-body">
      <div className="preview-note">가상 예시 · 실제 저장되지 않습니다.</div>
      <PatientNavigation view={view} onNavigate={setView}/>
      {view==="history"?<PatientHistory patient={patient} reload={()=>{}} busy={false}/>:<PatientForm kind={view} key={view} submit={submit}/>}
    </div>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Preview/>);
