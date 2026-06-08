import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configJs = readFileSync(path.join(repoRoot, "config.js"), "utf8");

function configValue(name, fallbackPattern) {
  return configJs.match(fallbackPattern)?.[1] || process.env[name] || "";
}

const supabaseUrl = (process.env.MSSI_SUPABASE_URL || configValue(
  "MSSI_SUPABASE_URL",
  /SUPABASE_URL = ENV\.VITE_SUPABASE_URL \|\| "([^"]+)"/
)).replace(/\/$/, "");
const supabaseAnonKey = process.env.MSSI_SUPABASE_ANON_KEY || configValue(
  "MSSI_SUPABASE_ANON_KEY",
  /SUPABASE_ANON_KEY = ENV\.VITE_SUPABASE_ANON_KEY \|\| "([^"]+)"/
);
const webhookUrl = process.env.MSSI_GOOGLE_WEBHOOK_URL || configValue(
  "MSSI_GOOGLE_WEBHOOK_URL",
  /GOOGLE_SHEETS_WEBHOOK_URL = ENV\.GOOGLE_SHEETS_WEBHOOK_URL \|\| "([^"]+)"/
);

const githubApi = "https://api.github.com/repos/snumood2/MSSI/actions/workflows/supabase-keepalive.yml/runs?per_page=1";
const githubRawWorkflow = "https://raw.githubusercontent.com/snumood2/MSSI/main/.github/workflows/supabase-keepalive.yml";
const timeoutMs = Number(process.env.MSSI_AUDIT_TIMEOUT_MS || 20000);
const outputPath = process.env.MSSI_AUDIT_OUTPUT || path.join(repoRoot, ".monthly-audit", "latest.json");

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSupabase() {
  const result = await fetchText(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: "application/json",
      "User-Agent": "MSSI-Monthly-Safety-Audit/1.0",
    },
  });
  return {
    name: "supabase_rest",
    ok: result.ok,
    status: result.status,
    response_bytes: result.text.length,
  };
}

async function checkGitHubWorkflowFile() {
  const result = await fetchText(githubRawWorkflow, {
    headers: { "User-Agent": "MSSI-Monthly-Safety-Audit/1.0" },
  });
  return {
    name: "github_workflow_file",
    ok: result.ok && result.text.includes("Supabase keepalive") && result.text.includes("schedule:"),
    status: result.status,
    response_bytes: result.text.length,
  };
}

async function checkGitHubLatestRun() {
  const result = await fetchText(githubApi, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "MSSI-Monthly-Safety-Audit/1.0",
    },
  });
  if (!result.ok) {
    return { name: "github_keepalive_latest_run", ok: false, status: result.status };
  }
  const json = JSON.parse(result.text);
  const run = json.workflow_runs?.[0];
  if (!run) {
    return { name: "github_keepalive_latest_run", ok: true, status: result.status, warning: "no_runs_yet" };
  }
  const updatedAt = new Date(run.updated_at || run.created_at);
  const ageDays = (Date.now() - updatedAt.getTime()) / 86400000;
  return {
    name: "github_keepalive_latest_run",
    ok: ageDays <= 45 && ["success", null].includes(run.conclusion),
    status: result.status,
    run_status: run.status,
    conclusion: run.conclusion,
    updated_at: run.updated_at,
    age_days: Number(ageDays.toFixed(2)),
    html_url: run.html_url,
  };
}

async function checkGoogleWebhook() {
  const result = await fetchText(webhookUrl, {
    headers: { "User-Agent": "MSSI-Monthly-Safety-Audit/1.0" },
  });
  let json = null;
  try {
    json = JSON.parse(result.text);
  } catch {
    // Keep json null; status/body size still helps diagnosis.
  }
  return {
    name: "google_apps_script_webhook",
    ok: Boolean(result.ok && json?.status === "ok" && json?.rawSheet && json?.reportSheet),
    status: result.status,
    app_status: json?.status || null,
    raw_rows: json?.rawSheet?.rows ?? null,
    report_sheet: json?.reportSheet?.name || null,
    response_bytes: result.text.length,
  };
}

function checkVmTimer() {
  try {
    const out = execFileSync("systemctl", ["--user", "is-active", "mssi-supabase-keepalive.timer"], { encoding: "utf8" }).trim();
    return { name: "vm_keepalive_timer", ok: out === "active", status: out };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { name: "vm_keepalive_timer", ok: true, status: "skipped", warning: "systemctl_not_available" };
    }
    return { name: "vm_keepalive_timer", ok: false, status: "error", error: String(error.message || error) };
  }
}

const startedAt = new Date().toISOString();
const checks = [];
for (const fn of [checkSupabase, checkGitHubWorkflowFile, checkGitHubLatestRun, checkGoogleWebhook]) {
  try {
    checks.push(await fn());
  } catch (error) {
    checks.push({ name: fn.name, ok: false, error: String(error.message || error) });
  }
}
checks.push(checkVmTimer());

const report = {
  ok: checks.every((check) => check.ok),
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  checks,
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

if (!report.ok) {
  process.exitCode = 1;
}
