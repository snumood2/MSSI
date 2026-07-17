import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROD_ORIGIN = "https://snumood2.github.io";
const MAX_BODY_BYTES = 16 * 1024;

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

Deno.serve(async (req: Request) => {
  const origin = allowedOrigin(req.headers.get("Origin"));
  if (!origin) return new Response("Forbidden origin", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" }, origin);
  if (Number(req.headers.get("Content-Length") || "0") > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "Payload too large" }, origin);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse(401, { error: "Authentication required" }, origin);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("too large");
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" }, origin);
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
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile || !["admin", "doctor"].includes(profile.role)) {
    return jsonResponse(403, { error: "Staff access required" }, origin);
  }

  const action = String(body.action || "");
  let requestId: string | null = null;
  let databaseUpdated = false;

  if (action === "change") {
    if (profile.role !== "admin") return jsonResponse(403, { error: "Administrator access required" }, origin);
    const hospitalCode = String(body.hospitalCode || "").trim().toUpperCase();
    const currentPatientNumber = String(body.currentPatientNumber || "").trim();
    const newPatientNumber = String(body.newPatientNumber || "").trim();
    if (!/^[A-Z0-9_-]{2,20}$/.test(hospitalCode) || !/^\d{8}$/.test(currentPatientNumber) || !/^\d{8}$/.test(newPatientNumber)) {
      return jsonResponse(400, { error: "Invalid patient number change" }, origin);
    }
    const { data, error } = await supabase.rpc("admin_change_patient_number", {
      p_hospital_code: hospitalCode,
      p_current_patient_number: currentPatientNumber,
      p_new_patient_number: newPatientNumber,
      p_note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
    });
    if (error) return jsonResponse(409, { error: error.message }, origin);
    requestId = data?.request_id || null;
    databaseUpdated = true;
  } else if (action === "review") {
    if (!isUuid(body.requestId) || typeof body.approve !== "boolean") {
      return jsonResponse(400, { error: "Invalid review request" }, origin);
    }
    const { data, error } = await supabase.rpc("review_patient_number_change", {
      p_request_id: body.requestId,
      p_approve: body.approve,
      p_note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
    });
    if (error) return jsonResponse(409, { error: error.message }, origin);
    if (!body.approve) return jsonResponse(200, { status: "rejected", requestId: body.requestId }, origin);
    requestId = data?.request_id || String(body.requestId);
    databaseUpdated = true;
  } else if (action === "sync") {
    if (!isUuid(body.requestId)) return jsonResponse(400, { error: "Invalid sync request" }, origin);
    requestId = String(body.requestId);
    databaseUpdated = true;
  } else {
    return jsonResponse(400, { error: "Unsupported action" }, origin);
  }

  if (!requestId) return jsonResponse(500, { error: "Missing change request id", databaseUpdated }, origin);
  const { data: syncRows, error: syncLookupError } = await supabase.rpc("prepare_patient_number_sheet_sync", {
    p_request_id: requestId,
  });
  const syncRow = Array.isArray(syncRows) ? syncRows[0] : syncRows;
  if (syncLookupError || !syncRow) {
    return jsonResponse(409, { error: syncLookupError?.message || "Sync record not found", requestId, databaseUpdated }, origin);
  }
  if (syncRow.sheet_sync_status === "synced") {
    return jsonResponse(200, { status: "ok", requestId, databaseUpdated, sheetSynced: true }, origin);
  }

  const webhookUrl = Deno.env.get("MSSI_GOOGLE_WEBHOOK_URL");
  const webhookSecret = Deno.env.get("MSSI_WEBHOOK_SECRET");
  if (!webhookUrl || !webhookSecret) {
    await supabase.rpc("mark_patient_number_sheet_sync", {
      p_request_id: requestId, p_success: false, p_error: "Sheet webhook is not configured",
    });
    return jsonResponse(503, { error: "Sheet synchronization is unavailable", requestId, databaseUpdated, sheetSynced: false }, origin);
  }

  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: webhookSecret,
        action: "change_patient_number",
        patientId: syncRow.patient_id,
        hospitalCode: syncRow.hospital_code,
        oldPatientNumber: syncRow.old_patient_number,
        newPatientNumber: syncRow.new_patient_number,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const webhookResult = await webhookResponse.json().catch(() => null);
    if (!webhookResponse.ok || webhookResult?.status !== "ok") throw new Error("Webhook rejected patient number change");
    await supabase.rpc("mark_patient_number_sheet_sync", {
      p_request_id: requestId, p_success: true, p_error: null,
    });
    return jsonResponse(200, {
      status: "ok",
      requestId,
      databaseUpdated,
      sheetSynced: true,
      sheetRowsUpdated: {
        rawData: webhookResult.rawUpdated || 0,
        db2Sheet: webhookResult.db2SheetUpdated || 0,
      },
    }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sheet synchronization failed";
    await supabase.rpc("mark_patient_number_sheet_sync", {
      p_request_id: requestId, p_success: false, p_error: message,
    });
    return jsonResponse(503, {
      error: "DB 변경은 완료되었지만 Google Sheets 동기화에 실패했습니다.",
      requestId,
      databaseUpdated,
      sheetSynced: false,
      retryable: true,
    }, origin);
  }
});
