import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateScores, generateReport } from "../../../scoring.js";

const PROD_ORIGIN = "https://snumood2.github.io";
const MAX_BODY_BYTES = 1024 * 1024;

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return PROD_ORIGIN;
  if (origin === PROD_ORIGIN) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(status: number, body: unknown, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

Deno.serve(async (req: Request) => {
  const origin = allowedOrigin(req.headers.get("Origin"));
  if (!origin) return new Response("Forbidden origin", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" }, origin);

  const contentLength = Number(req.headers.get("Content-Length") || "0");
  if (contentLength > MAX_BODY_BYTES) return jsonResponse(413, { error: "Payload too large" }, origin);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse(401, { error: "Authentication required" }, origin);

  let body: { responseId?: unknown; answers?: unknown };
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: "Payload too large" }, origin);
    }
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" }, origin);
  }

  if (!isUuid(body.responseId) || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return jsonResponse(400, { error: "Invalid submission" }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return jsonResponse(500, { error: "Server configuration error" }, origin);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonResponse(401, { error: "Invalid session" }, origin);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, hospital_code, patient_number, dob, doctor_name, hospital_name")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile || profile.role !== "patient") {
    return jsonResponse(403, { error: "Patient access required" }, origin);
  }

  const { data: responseRow, error: responseError } = await supabase
    .from("survey_responses")
    .select("id, patient_id, hospital_code, patient_number, assessment_no, assessment_key")
    .eq("id", body.responseId)
    .eq("patient_id", userData.user.id)
    .single();
  if (responseError || !responseRow) return jsonResponse(404, { error: "Survey response not found" }, origin);
  if (responseRow.hospital_code !== profile.hospital_code || responseRow.patient_number !== profile.patient_number) {
    return jsonResponse(409, { error: "Survey identity mismatch" }, origin);
  }

  let scores: unknown;
  let report: unknown;
  try {
    scores = calculateScores(body.answers);
    report = generateReport(scores, body.answers);
  } catch (error) {
    console.error("Score calculation failed", error);
    return jsonResponse(422, { error: "Score calculation failed" }, origin);
  }

  // Persist the latest answers first, but do not mark the survey completed until
  // the sheet accepts the same response. A retry therefore cannot lose answers
  // or create a duplicate sheet row.
  const { error: answerSaveError } = await supabase
    .from("survey_responses")
    .update({ answers: body.answers })
    .eq("id", responseRow.id)
    .eq("patient_id", userData.user.id);
  if (answerSaveError) {
    console.error("Survey answer save failed", answerSaveError);
    return jsonResponse(409, { error: "Survey answers could not be saved" }, origin);
  }

  const completedAt = new Date().toISOString();
  const webhookUrl = Deno.env.get("MSSI_GOOGLE_WEBHOOK_URL");
  const webhookSecret = Deno.env.get("MSSI_WEBHOOK_SECRET");
  if (!webhookUrl || !webhookSecret) {
    console.error("Google Sheets webhook secrets are not configured");
    return jsonResponse(503, { error: "Sheet synchronization is temporarily unavailable", retryable: true }, origin);
  }

  const webhookPayload = {
    secret: webhookSecret,
    timestamp: completedAt,
    responseId: responseRow.id,
    patientId: profile.id,
    dob: profile.dob || "",
    hospitalCode: profile.hospital_code || "",
    patientNumber: profile.patient_number || "",
    assessmentNo: responseRow.assessment_no || "",
    assessmentKey: responseRow.assessment_key || "",
    doctorNickname: profile.doctor_name || "",
    hospitalNickname: profile.hospital_name || "",
    answers: body.answers,
    scores,
    report,
    scoresJson: safeJson(scores),
    reportJson: safeJson(report),
  };

  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(webhookPayload),
      signal: AbortSignal.timeout(20000),
    });
    if (!webhookResponse.ok) throw new Error(`HTTP ${webhookResponse.status}`);
    const webhookResult = await webhookResponse.json().catch(() => null);
    if (!webhookResult || webhookResult.status !== "ok") throw new Error("Webhook rejected the submission");
  } catch (error) {
    console.error("Google Sheets synchronization failed", error);
    return jsonResponse(503, {
      error: "Sheet synchronization is temporarily unavailable",
      retryable: true,
    }, origin);
  }

  const { error: completeError } = await supabase
    .from("survey_responses")
    .update({
      scores,
      report,
      status: "completed",
      completed: true,
      completed_at: completedAt,
    })
    .eq("id", responseRow.id)
    .eq("patient_id", userData.user.id);
  if (completeError) {
    console.error("Survey completion failed", completeError);
    return jsonResponse(409, { error: "Survey could not be completed", retryable: true }, origin);
  }

  return jsonResponse(200, { status: "ok", report, completedAt }, origin);
});
