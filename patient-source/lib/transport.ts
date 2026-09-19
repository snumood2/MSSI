import type {Patient} from "./clinical";
type ScriptRunner={withSuccessHandler:(fn:(data:Patient)=>void)=>ScriptRunner;withFailureHandler:(fn:(error:{message:string})=>void)=>ScriptRunner;getPatientHistory:(id:string)=>void};
declare global {interface Window {google?:{script?:{run:ScriptRunner}};}}
export async function getPatient(patientId:string):Promise<Patient>{
  if(window.google?.script?.run)return new Promise((resolve,reject)=>{window.google!.script!.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e.message))).getPatientHistory(patientId);});
  const response=await fetch("/api/patient",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({patientId}),cache:"no-store"});
  const data=await response.json() as Patient & {error?:string};if(!response.ok)throw new Error(data.error||"기록을 불러오지 못했습니다.");return data;
}
