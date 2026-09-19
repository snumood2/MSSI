const views=new Set(["history","lifestyle","mssi"]);
export function patientFlowQuery(search){const next=new URLSearchParams(search).get("next");return views.has(next)?`?next=${next}`:"";}
export function patientReturnTarget(search){const next=new URLSearchParams(search).get("next");return views.has(next)?`patient.html?view=${next}`:"respondent.html";}
