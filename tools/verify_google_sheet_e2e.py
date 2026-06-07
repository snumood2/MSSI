import json
import pathlib
import time
import urllib.parse
import urllib.request

TOKEN_PATH = pathlib.Path("/Users/hongisu/shared/tokens/google_token.json")
SID = "1mHaUquO0qdv7bpj9T7LIPVfyUsUlX87uyHiAS_dyG78"
DATA_PATH = pathlib.Path("/tmp/mssi_operational_legacy_rows.json")


def access_token():
    info = json.loads(TOKEN_PATH.read_text())
    body = urllib.parse.urlencode(
        {
            "client_id": info["client_id"],
            "client_secret": info["client_secret"],
            "refresh_token": info["refresh_token"],
            "grant_type": "refresh_token",
        }
    ).encode()
    req = urllib.request.Request(
        info.get("token_uri", "https://oauth2.googleapis.com/token"),
        data=body,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode())["access_token"]


TOKEN = access_token()
BASE = f"https://sheets.googleapis.com/v4/spreadsheets/{SID}/values"


def get(rng, option="FORMATTED_VALUE"):
    url = BASE + "/" + urllib.parse.quote(rng, safe="") + "?valueRenderOption=" + option
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + TOKEN})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode()).get("values", [])


def put(rng, values):
    url = BASE + "/" + urllib.parse.quote(rng, safe="") + "?valueInputOption=USER_ENTERED"
    req = urllib.request.Request(
        url,
        data=json.dumps({"range": rng, "majorDimension": "ROWS", "values": values}).encode(),
        method="PUT",
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode())


def fmt(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        if abs(value - round(value)) < 1e-9:
            return str(int(round(value)))
        return str(round(value, 2)).rstrip("0").rstrip(".")
    return str(value)


def sheet_rows_by_name(values):
    rows = {}
    for row in values:
        if len(row) >= 2 and row[0]:
            rows[str(row[0]).strip()] = row[1:4]
    return rows


data = json.loads(DATA_PATH.read_text())
raw = get("RAWDATA!A1:F1000")
row_by_patient = {}
for idx, row in enumerate(raw, start=1):
    for cell in row:
        if isinstance(cell, str) and cell.startswith("E2E-"):
            row_by_patient[cell] = idx

print("WRITE_ROWS")
for patient in data["patients"]:
    pnum = patient["patient_number"]
    row_index = row_by_patient.get(pnum)
    print(pnum, row_index)
    if not row_index:
        raise SystemExit(f"missing raw row for {pnum}")
    put(f"RAWDATA!D{row_index}:AFY{row_index}", [patient["legacy_row"]])

print("\nVERIFY")
all_ok = True
for patient in data["patients"]:
    pnum = patient["patient_number"]
    put("검사결과지!H4:H4", [[pnum]])
    time.sleep(6)
    report = get("검사결과지!A1:K120")
    flat = [cell for row in report for cell in row]
    errors = [cell for cell in flat if isinstance(cell, str) and cell.startswith("#")]
    rows = sheet_rows_by_name(get("검사결과지!B13:E109"))
    mismatches = []
    for name, expected in patient["expected_rows"].items():
        actual = rows.get(name)
        if actual is None:
            mismatches.append({"name": name, "reason": "missing_in_sheet"})
            continue
        exp_score = fmt(expected.get("score"))
        act_score = fmt(actual[0] if len(actual) > 0 else "")
        if exp_score != act_score:
            mismatches.append({"name": name, "expected": exp_score, "actual": act_score})
    ok = not errors and not mismatches
    all_ok = all_ok and ok
    print(json.dumps({
        "patient_number": pnum,
        "ok": ok,
        "errors": errors[:10],
        "mismatches": mismatches,
    }, ensure_ascii=False))

raise SystemExit(0 if all_ok else 1)
