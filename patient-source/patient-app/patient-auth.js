import {createClient} from "./vendor/supabase-js.js";
import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./config.js";
import {getAuthSession} from "./auth-session.js";
const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
window.clinicAuth={
  session:async()=>{const session=await getAuthSession(sb);if(session){sessionStorage.removeItem("mssi_auth_handoff");if(window.name.startsWith("MSSI_AUTH:"))window.name="";}return session;},
  signOut:async()=>{await sb.auth.signOut();sessionStorage.removeItem("mssi_auth_handoff");if(window.name.startsWith("MSSI_AUTH:"))window.name="";location.replace("login-snubh01.html");},
  onSignOut:callback=>{const {data:{subscription}}=sb.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")setTimeout(callback,0);});return()=>subscription.unsubscribe();}
};
const app=document.createElement("script");app.src="patient-bundle.js?v=patient-api-20260922";app.defer=true;document.body.appendChild(app);
