import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configJs = readFileSync(path.join(repoRoot, "config.js"), "utf8");
const configUrl = configJs.match(/SUPABASE_URL = ENV\.VITE_SUPABASE_URL \|\| "([^"]+)"/)?.[1];
const configAnonKey = configJs.match(/SUPABASE_ANON_KEY = ENV\.VITE_SUPABASE_ANON_KEY \|\| "([^"]+)"/)?.[1];

const url = (process.env.MSSI_SUPABASE_URL || configUrl || "").replace(/\/$/, "");
const anonKey = process.env.MSSI_SUPABASE_ANON_KEY || configAnonKey;
const timeoutMs = Number(process.env.MSSI_KEEPALIVE_TIMEOUT_MS || 15000);

if (!url || !anonKey) {
  throw new Error("Supabase URL/key is missing.");
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
const startedAt = new Date();

try {
  const response = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
      "User-Agent": "MSSI-Supabase-Keepalive/1.0",
    },
    signal: controller.signal,
  });

  const body = await response.text();
  const ok = response.ok;
  const detail = {
    ok,
    status: response.status,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    response_bytes: body.length,
  };

  console.log(JSON.stringify(detail));

  if (!ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    error: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
  }));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
