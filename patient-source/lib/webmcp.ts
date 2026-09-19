type Tool={name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>Promise<unknown>};
declare global{interface Document{modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>};}}
export function registerPeriodTool(setPeriod:(months:number)=>void){
  const context=document.modelContext;if(!context?.registerTool)return()=>{};
  const lifecycle=new AbortController();
  const registration=context.registerTool({name:"set_history_period",title:"경과 조회 기간 선택",description:"현재 화면의 환자 기록 조회 기간을 선택합니다. 환자나 응답 데이터는 반환하지 않습니다.",inputSchema:{type:"object",properties:{months:{type:"integer",enum:[0,3,6,12]}},required:["months"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:unknown)=>{
    if(!input||typeof input!=="object"||Object.keys(input).some(k=>k!=="months")||!("months" in input)||![0,3,6,12].includes(input.months as number))throw new Error("months must be 0, 3, 6 or 12");
    const months=input.months as number;setPeriod(months);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    return{months,displayed:document.querySelector(`[data-period="${months}"]`)?.getAttribute("aria-pressed")==="true"};
  }},{signal:lifecycle.signal});
  void Promise.resolve(registration).catch(()=>{});return()=>lifecycle.abort();
}
