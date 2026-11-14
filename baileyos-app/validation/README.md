# BaileyOS corridor validation + Queen Ant consensus

Standard-library Python. No keys, no network, no AI inside these modules. Nothing runs on a timer: every step runs only when a person presses its button in the HUD.

| Step (HUD button) | What runs | Endpoint |
|---|---|---|
| 1. Run Python validation | `api/_validate_corridor.py` | `POST /api/validate` |
| 2. Gemini review | the HUD server asks Gemini (`/api/oracle`) to review the report and return JSON | `POST /api/oracle` (existing) |
| 3. Kimi independent check | **pending**: awaiting Kimi validator | — |
| 4. Convene the Queen | `api/_consensus.py` | `POST /api/consensus` |

Run locally (from `baileyos-app/`):
`python api/_validate_corridor.py validation/sample_input.json --pretty` and `python -m unittest validation.test_validate_corridor validation.test_consensus`

## Hashing (same rule everywhere)
`canonical_json(x) = json.dumps(x, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`; floats in the report are rounded to 6 decimals.
- `input_sha256` = SHA-256 of `canonical_json({"corridor": ..., "nodes": ...})`
- `report_sha256` = SHA-256 of the UTF-8 bytes of `report_canonical_json` (the canonical string of `report`, which has no hash field inside it)
- `ruling_sha256` = SHA-256 of `canonical_json(ruling without ruling_sha256)`

## Validator input
`{"corridor": <GeoJSON FeatureCollection with one LineString>, "nodes": [{"id","name","type","lat","lon"}, ...]}` (max 64 KB). See `sample_input.json`.

## Report schema (`schema_version` "1.0")
`POST /api/validate` returns `{"report": {...}, "report_sha256": "<hex>", "report_canonical_json": "<string>"}`.

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | string | `"1.0"` |
| `validator` | object | `name`, `version`, `language` ("python"), `python`, `dependencies` |
| `generated_at` | string | UTC, `YYYY-MM-DDTHH:MM:SSZ` |
| `input_sha256` | string | hash of the exact input that was checked |
| `parameters` | object | `bbox` {lon_min, lon_max, lat_min, lat_max} (Colorado+Utah), `expected_keypoints` (9), `buffer_miles`, `buffer_km`, `earth_radius_km` |
| `checks[]` | array | `{id, title, status: "PASS"\|"FAIL", value: <object with the real computed numbers>, detail: string}` |
| `summary` | object | `{total, passed, failed, overall: "PASS"\|"FAIL"}` |

Checks: **C1** geojson_structure, **C2** keypoint_count (found vs 9), **C3** keypoints_in_bbox, **C4** corridor_length (km, per segment), **C5** nodes_valid, **C6** nodes_near_corridor (distance in km per node vs the buffer, default 5 miles = 8.047 km), **C7** data_freshness. Distances use haversine for length and a local equirectangular point-to-segment projection for node distance (error well under 1% at this scale).

**C7** reads `validation/freshness_limits.json`. There is no single global max age. Each layer has its own `max_age_seconds` (chain laws and closures, AMBER, Silver, and NWS alerts at minutes; earthquakes and the station observation at hours; crime in days). The report repeats those limits. A layer **fails** when the fetch is older than its own limit, the fetch errored, or the source is not configured. A fresh fetch with zero records is a **warning**, not an all-clear. `summary.overall` is `PASS` only when every check is `PASS`.

## Canonical bytes
`canonical_json` is `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`: sorted keys, no insignificant whitespace, UTF-8, no trailing newline.

- `input_sha256` hashes the UTF-8 bytes of `canonical_json({"corridor", "nodes", "freshness"})` only.
- `report_sha256` hashes the UTF-8 bytes of `canonical_json(report)` only. The report object does not contain `report_sha256` or the Kimi package.
- The Kimi package wrapper, including the rule text, is not hashed. Every package embeds this rule in `canonicalization`.

The Queen recomputes both hashes before it accepts a verdict. A mismatch is `uncertain` and flagged `hash_mismatch`. A stale or failed feed blocks `CONSENSUS` even when all 7 checks passed at report time and both reviewers agree. The best ruling is then `PROVISIONAL`. `DISSENT` still wins when a reviewer disagrees.

## Reviewer verdict (Gemini and Kimi use the same shape)
The reviewer is given the exact `report_canonical_json` and must answer with only:
`{"verdict": "agree" | "disagree" | "uncertain", "reason": "<one or two sentences>"}`
"agree" = the reviewer agrees the Python report is a correct, faithful result of its checks.
Kimi (or anyone) submits to the Queen: `{"verdict" or "raw_reply", "reason", "reviewed_report_sha256": "<report_sha256 it reviewed>", "model": "...", "reviewed_at": "..."}`.
Unparseable text, an unknown verdict, or a different `reviewed_report_sha256` counts as **uncertain**. `{"unavailable": true, "reason": "..."}` means the reviewer could not be reached.

## Queen Ant Colony Consensus Engine V3 (`api/_consensus.py`)
Three seats: Python (always agrees with itself), Gemini, Kimi. Rules, checked in this order:
1. **NO_RULING**: report missing, hash does not match, or malformed.
2. **DISSENT**: any reviewer says `disagree`. The ruling lists who and why.
3. **UNRESOLVED**: nobody disagrees but a reviewer is `uncertain` or unavailable. Never shown as consensus.
4. **CONSENSUS**: both reviewers have voted and agree (3 of 3), and no feed is stale or failed at convene time.
5. **PROVISIONAL**: voted reviewers all agree but one is pending, for example `PROVISIONAL (2 of 3, awaiting Kimi)`, or everyone agrees but a feed is stale or failed (`PROVISIONAL — stale or failed feed; consensus is not available`).
6. **PENDING**: no reviewer has voted (1 of 3).

`POST /api/consensus` takes `{"report_canonical_json", "report_sha256", "gemini": <verdict>|null, "kimi": <verdict>|null}` and returns
`{schema_version, engine{name,version}, convened_at, ruling, label, report_sha256, python_overall, seats{total,agreeing}, votes[], dissent[], ruling_sha256}`.
A consensus on a FAIL report means the reviewers agree the data failed; `python_overall` always shows which.

## For Kimi
The HUD button **Copy package for Kimi** copies `kimi_package`: the canonicalization rule, `input_canonical_json`, `input_sha256`, `report_canonical_json`, `report_sha256`, and `response_schema`. Paste that package to Kimi. Paste Kimi's reply back into the slot. The reply should be:

`{"verdict":"agree|disagree|uncertain","reason":"...","reviewed_report_sha256":"<report_sha256>","reviewed_input_sha256":"<input_sha256>"}`

The server recomputes both hashes before the Queen accepts the reply. A mismatch is `uncertain` with `hash_mismatch`. Until a reply is tied to the current report, the HUD shows "awaiting Kimi validator".

## Decision records
Every Queen ruling can be sealed as a tamper-evident decision record (`api/_ruling.py`). The seal shows the record was not altered after sealing. It does not show the decision was correct or that the data was accurate. See [RULING_RECORD.md](RULING_RECORD.md). This repository does not connect the record to `landing-stone/` yet.

## Where this runs
Vercel’s Next.js preset does not publish `api/*.py` as separate Python functions. The HUD calls `POST /api/data-nest/validate`, `POST /api/data-nest/consensus`, and `POST /api/data-nest/verify`, which run these modules with `python3`. On Vercel the build downloads a standalone CPython into `vendor/python` (not committed) so the same files execute there.
