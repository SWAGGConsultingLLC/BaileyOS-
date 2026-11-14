#!/usr/bin/env python3
"""
BaileyOS corridor validator  (schema_version 1.0)

Deterministic, standard-library-only checks for the Moab -> Glenwood Springs
I-70 corridor demo data. No network, no randomness, no AI. Same input -> same
checks (only `generated_at` changes between runs).

Checks
  C1 geojson_structure     valid FeatureCollection / LineString, WGS84 ranges, no duplicate steps
  C2 keypoint_count        number of corridor keypoints == EXPECTED_KEYPOINTS (9, the number the HUD claims)
  C3 keypoints_in_bbox     every keypoint inside the Colorado + Utah bounding box
  C4 corridor_length       great-circle length of the corridor (informational, must be finite and > 0)
  C5 nodes_valid           node ids unique, coordinates valid and inside the CO/UT bbox
  C6 nodes_near_corridor   each node is within the corridor buffer (km) of the corridor line
  C7 data_freshness        each layer was fetched inside its own max age
  C8 value_sanity          when a layer includes item values, magnitude, region, and time are in range

Hashes (so a reviewer can see which bytes were checked)
  input_sha256   = SHA-256 of canonical_json({"corridor":..., "nodes":..., "freshness":...})
  report_sha256  = SHA-256 of the UTF-8 bytes of canonical_json(report)   (report has no hash field inside it)
  canonical_json = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
  All floats in the report are rounded to 6 decimals.

CLI:  python _validate_corridor.py input.json            -> report JSON on stdout
      python _validate_corridor.py input.json --pretty   -> indented
Input JSON: {"corridor": <GeoJSON FeatureCollection>, "nodes": [{"id","name","type","lat","lon"}, ...]}
Exit code: 0 if every check passed, 1 if any failed, 2 on unreadable input.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone

SCHEMA_VERSION = "1.0"
VALIDATOR_NAME = "baileyos-corridor-validator"
VALIDATOR_VERSION = "1.0.0"

# Union bounding box of Colorado and Utah (WGS84, degrees).
BBOX = {"lon_min": -114.06, "lon_max": -102.04, "lat_min": 36.99, "lat_max": 42.01}
EXPECTED_KEYPOINTS = 9            # the HUD claims "9 keypoints"
DEFAULT_BUFFER_MILES = 5.0        # used if the corridor does not declare bufferRadiusMiles
KM_PER_MILE = 1.609344
EARTH_RADIUS_KM = 6371.0088
MAX_INPUT_NODES = 200
MAX_INPUT_POINTS = 5000

# Embedded in every Kimi package. These words name the exact bytes that are hashed.
CANONICALIZATION = {
    "rule": "JSON with sorted keys, separators ',' and ':' (no whitespace), UTF-8, no trailing newline.",
    "function": "json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)",
    "encoding": "UTF-8",
    "trailing_newline": False,
    "input_sha256_bytes": "SHA-256 of the UTF-8 bytes of canonical JSON for the object with exactly the keys corridor, nodes, and freshness, in sorted-key form, with no surrounding whitespace and no trailing newline. The Kimi package, this rule, and the report are not part of those bytes.",
    "report_sha256_bytes": "SHA-256 of the UTF-8 bytes of canonical JSON for the report object only, with no surrounding whitespace and no trailing newline. The report object does not contain report_sha256, input_canonical_json, input_sha256's twin fields, or this rule.",
}

RESPONSE_SCHEMA = {
    "verdict": "agree | disagree | uncertain",
    "reason": "one or two sentences",
    "reviewed_report_sha256": "the report_sha256 string from this package",
    "reviewed_input_sha256": "the input_sha256 string from this package",
}

_LIMITS_CACHE = None


def load_freshness_limits() -> dict:
    """One config file. The report repeats these per-layer max ages. There is no global threshold."""
    global _LIMITS_CACHE
    if _LIMITS_CACHE is not None:
        return _LIMITS_CACHE
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "validation", "freshness_limits.json")
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        _LIMITS_CACHE = {}
        return _LIMITS_CACHE
    if not isinstance(data, dict):
        _LIMITS_CACHE = {}
        return _LIMITS_CACHE
    _LIMITS_CACHE = data
    return data


def input_document(data) -> dict:
    """The only object whose canonical bytes are input_sha256."""
    if not isinstance(data, dict):
        return {"corridor": None, "nodes": [], "freshness": None}
    nodes = data.get("nodes")
    nodes = nodes if isinstance(nodes, list) else []
    if len(nodes) > MAX_INPUT_NODES:
        nodes = nodes[:MAX_INPUT_NODES]
    return {"corridor": data.get("corridor"), "nodes": nodes, "freshness": data.get("freshness")}


def parse_utc_z(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _source_row(key: str, cfg: dict, raw, now: datetime) -> dict:
    label = cfg.get("label") if isinstance(cfg, dict) else key
    max_age = cfg.get("max_age_seconds") if isinstance(cfg, dict) else None
    note = cfg.get("note") if isinstance(cfg, dict) else None
    base = {
        "id": key,
        "label": label,
        "note": note,
        "max_age_seconds": max_age,
        "fetched_at": None,
        "source_timestamp": None,
        "fetch_age_seconds": None,
        "source_age_seconds": None,
        "record_count": None,
        "status": "fail",
        "detail": "",
    }
    if not isinstance(max_age, (int, float)) or isinstance(max_age, bool) or max_age <= 0:
        base["detail"] = "max age missing from config"
        return base
    if not isinstance(raw, dict):
        base["detail"] = "missing freshness record"
        return base
    if raw.get("available") is False:
        base["detail"] = str(raw.get("error") or "not configured")[:240]
        base["record_count"] = raw.get("record_count") if isinstance(raw.get("record_count"), int) else 0
        return base
    if isinstance(raw.get("error"), str) and raw.get("error").strip():
        base["detail"] = raw["error"].strip()[:240]
        base["fetched_at"] = raw.get("fetched_at") if isinstance(raw.get("fetched_at"), str) else None
        base["record_count"] = raw.get("record_count") if isinstance(raw.get("record_count"), int) else 0
        return base
    fetched = parse_utc_z(raw.get("fetched_at"))
    if fetched is None:
        base["detail"] = "fetched_at is missing or not UTC Zulu YYYY-MM-DDTHH:MM:SSZ"
        return base
    age = int(round((now - fetched).total_seconds()))
    source_at = parse_utc_z(raw.get("source_timestamp")) if raw.get("source_timestamp") else None
    source_age = int(round((now - source_at).total_seconds())) if source_at else None
    count = raw.get("record_count")
    base.update({
        "fetched_at": raw.get("fetched_at"),
        "source_timestamp": raw.get("source_timestamp") if isinstance(raw.get("source_timestamp"), str) else None,
        "fetch_age_seconds": age,
        "source_age_seconds": source_age,
        "record_count": count if isinstance(count, int) and not isinstance(count, bool) else None,
    })
    if age < -120:
        base["detail"] = "fetch time is in the future"
        return base
    if age > max_age:
        base["detail"] = f"stale: fetched {age}s ago, max {int(max_age)}s"
        return base
    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
        base["detail"] = "record_count missing"
        return base
    if count == 0:
        base["status"] = "warn"
        base["detail"] = "fresh fetch, empty feed"
        return base
    base["status"] = "pass"
    base["detail"] = f"{count} records, fetched {age}s ago (max {int(max_age)}s)"
    return base


def evaluate_freshness(raw, now: datetime) -> dict:
    limits = load_freshness_limits()
    if not limits:
        return {
            "limits": {},
            "sources": [],
            "blocks_consensus": True,
            "check_status": False,
            "detail": "freshness limits config is missing",
        }
    table = raw if isinstance(raw, dict) else {}
    sources = []
    for key, cfg in limits.items():
        src = table.get(key)
        row = _source_row(key, cfg, src, now)
        fp = src.get("payload_sha256") if isinstance(src, dict) else None
        if isinstance(fp, str) and len(fp) == 64 and all(ch in "0123456789abcdef" for ch in fp):
            row["payload_sha256"] = fp
        sources.append(row)
    failed = [s["id"] for s in sources if s["status"] == "fail"]
    warned = [s["id"] for s in sources if s["status"] == "warn"]
    if failed:
        status, detail = False, "stale, failed, or not configured: " + ", ".join(failed)
    elif warned:
        status, detail = "WARN", "fresh but empty: " + ", ".join(warned)
    else:
        status, detail = True, "every layer was fetched within its own max age and has records"
    return {
        "limits": limits,
        "sources": sources,
        "blocks_consensus": bool(failed),
        "check_status": status,
        "detail": detail,
    }


def _item_number(item: dict, *names):
    for name in names:
        if name in item and item[name] is not None:
            return item[name]
    return None


def _item_coords(item: dict):
    lat = _item_number(item, "lat", "latitude")
    lon = _item_number(item, "lon", "longitude")
    coords = item.get("coordinates")
    if lat is None and lon is None and isinstance(coords, list) and len(coords) >= 2:
        lon, lat = coords[0], coords[1]
    return lat, lon


def _item_timestamp(item: dict):
    for name in ("time", "issued_at", "issuedAt", "source_timestamp", "sent"):
        if item.get(name) is not None:
            return name, item.get(name)
    return None, None


def evaluate_sanity(raw, now: datetime) -> dict:
    """Check #8. A layer with no item values is not failed. A value outside the range fails and blocks CONSENSUS."""
    limits = load_freshness_limits()
    table = raw if isinstance(raw, dict) else {}
    problems = []
    checked = 0
    for key in limits:
        src = table.get(key)
        if not isinstance(src, dict) or "items" not in src:
            continue
        items = src.get("items")
        if not isinstance(items, list):
            problems.append(f"{key}: items is not a list")
            continue
        count = src.get("record_count")
        if isinstance(count, int) and not isinstance(count, bool) and count != len(items):
            problems.append(f"{key}: record_count {count} does not match {len(items)} items")
        for index, item in enumerate(items):
            checked += 1
            if not isinstance(item, dict):
                problems.append(f"{key}[{index}] is not an object")
                continue
            mag = _item_number(item, "mag", "magnitude")
            if key == "usgs" or mag is not None:
                if mag is None:
                    problems.append(f"{key}[{index}] magnitude missing")
                elif not _is_num(mag) or not (0 <= float(mag) <= 10):
                    problems.append(f"{key}[{index}] magnitude outside 0 to 10")
            lat, lon = _item_coords(item)
            needs_point = key == "usgs"
            if needs_point and (lat is None or lon is None):
                problems.append(f"{key}[{index}] coordinates missing")
            elif lat is not None or lon is not None:
                if not (_is_num(lat) and _is_num(lon) and _in_bbox(float(lon), float(lat))):
                    problems.append(f"{key}[{index}] coordinates outside the Colorado and Utah region")
            _name, stamp = _item_timestamp(item)
            if stamp is not None:
                parsed = parse_utc_z(stamp) if isinstance(stamp, str) else None
                if parsed is None:
                    problems.append(f"{key}[{index}] timestamp is not UTC Zulu YYYY-MM-DDTHH:MM:SSZ")
                elif (parsed - now).total_seconds() > 120:
                    problems.append(f"{key}[{index}] timestamp is in the future")
    blocked = bool(problems)
    if problems:
        detail = "; ".join(problems[:8])
    elif checked:
        detail = f"{checked} item values are inside the published ranges"
    else:
        detail = "no item values were supplied, so no value was outside the published ranges"
    return {
        "checked_items": checked,
        "problems": problems[:40],
        "blocks_consensus": blocked,
        "check_status": not blocked,
        "detail": detail,
    }


def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _r(x):
    """Round floats to 6 dp so reports are stable across platforms."""
    if isinstance(x, bool) or x is None:
        return x
    if isinstance(x, float):
        return round(x, 6)
    if isinstance(x, dict):
        return {k: _r(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_r(v) for v in x]
    return x


def haversine_km(lon1, lat1, lon2, lat2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def point_to_segment_km(plon, plat, alon, alat, blon, blat) -> float:
    """Distance (km) from P to segment AB using a local equirectangular projection
    centred on P. Accurate to well under 1% for corridor-scale (<300 km) segments."""
    kx = math.cos(math.radians(plat)) * math.pi / 180 * EARTH_RADIUS_KM  # km per degree lon
    ky = math.pi / 180 * EARTH_RADIUS_KM                                  # km per degree lat
    ax, ay = (alon - plon) * kx, (alat - plat) * ky
    bx, by = (blon - plon) * kx, (blat - plat) * ky
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(cx, cy)


def distance_to_line_km(plon, plat, coords) -> float:
    return min(
        point_to_segment_km(plon, plat, a[0], a[1], b[0], b[1])
        for a, b in zip(coords[:-1], coords[1:])
    )


def _in_bbox(lon, lat) -> bool:
    return BBOX["lon_min"] <= lon <= BBOX["lon_max"] and BBOX["lat_min"] <= lat <= BBOX["lat_max"]


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _check(cid, title, status, value, detail):
    if status is True:
        label = "PASS"
    elif status == "WARN":
        label = "WARN"
    else:
        label = "FAIL"
    return {"id": cid, "title": title, "status": label, "value": value, "detail": detail}


def _extract_line(corridor):
    """Return (coords, buffer_miles, problems)."""
    problems = []
    if not isinstance(corridor, dict) or corridor.get("type") != "FeatureCollection":
        return [], DEFAULT_BUFFER_MILES, ["corridor.type is not 'FeatureCollection'"]
    feats = corridor.get("features")
    if not isinstance(feats, list) or not feats:
        return [], DEFAULT_BUFFER_MILES, ["corridor.features is empty or not a list"]
    f = feats[0]
    geom = f.get("geometry") if isinstance(f, dict) else None
    props = (f.get("properties") if isinstance(f, dict) else None) or {}
    if not isinstance(geom, dict) or geom.get("type") != "LineString":
        return [], DEFAULT_BUFFER_MILES, ["first feature geometry is not a LineString"]
    raw = geom.get("coordinates")
    if not isinstance(raw, list) or len(raw) < 2:
        return [], DEFAULT_BUFFER_MILES, ["LineString needs at least 2 coordinates"]
    if len(raw) > MAX_INPUT_POINTS:
        return [], DEFAULT_BUFFER_MILES, [f"more than {MAX_INPUT_POINTS} coordinates"]
    coords = []
    for i, c in enumerate(raw):
        if not (isinstance(c, list) and len(c) >= 2 and _is_num(c[0]) and _is_num(c[1])):
            problems.append(f"coordinate[{i}] is not a finite [lon, lat] pair")
            continue
        lon, lat = float(c[0]), float(c[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            problems.append(f"coordinate[{i}] outside WGS84 range: [{lon}, {lat}]")
        coords.append([lon, lat])
    for i in range(1, len(coords)):
        if coords[i] == coords[i - 1]:
            problems.append(f"coordinate[{i}] repeats coordinate[{i - 1}]")
    buf = props.get("bufferRadiusMiles")
    buffer_miles = float(buf) if _is_num(buf) and buf > 0 else DEFAULT_BUFFER_MILES
    return coords, buffer_miles, problems


def build_report(data: dict, now: datetime | None = None) -> dict:
    doc = input_document(data if isinstance(data, dict) else {})
    corridor = doc["corridor"]
    nodes = doc["nodes"]
    when = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    input_sha = sha256_hex(canonical_json(doc))
    coords, buffer_miles, problems = _extract_line(corridor)
    buffer_km = buffer_miles * KM_PER_MILE
    checks = []

    # C1
    checks.append(_check("C1", "geojson_structure", not problems and len(coords) >= 2,
                         {"coordinates": len(coords), "problems": problems},
                         "FeatureCollection with a LineString, finite WGS84 coordinates, no repeated consecutive points"
                         if not problems else "; ".join(problems)))
    usable = len(coords) >= 2

    # C2
    checks.append(_check("C2", "keypoint_count", len(coords) == EXPECTED_KEYPOINTS,
                         {"found": len(coords), "expected": EXPECTED_KEYPOINTS},
                         f"corridor has {len(coords)} keypoints; the HUD claims {EXPECTED_KEYPOINTS}"))

    # C3
    outside = [{"index": i, "lon": c[0], "lat": c[1]} for i, c in enumerate(coords) if not _in_bbox(c[0], c[1])]
    checks.append(_check("C3", "keypoints_in_bbox", usable and not outside,
                         {"bbox": BBOX, "checked": len(coords), "outside": outside},
                         "all keypoints inside the Colorado + Utah bounding box" if usable and not outside
                         else (f"{len(outside)} keypoint(s) outside the bounding box" if usable else "no usable coordinates")))

    # C4
    if usable:
        seg = [haversine_km(a[0], a[1], b[0], b[1]) for a, b in zip(coords[:-1], coords[1:])]
        total = sum(seg)
        checks.append(_check("C4", "corridor_length", math.isfinite(total) and total > 0,
                             {"total_km": total, "segments": len(seg), "longest_segment_km": max(seg), "shortest_segment_km": min(seg)},
                             f"great-circle length {total:.1f} km over {len(seg)} segments"))
    else:
        checks.append(_check("C4", "corridor_length", False, {"total_km": None}, "no usable coordinates"))

    # C5
    ids = [n.get("id") if isinstance(n, dict) else None for n in nodes]
    dup_ids = sorted({i for i in ids if i is not None and ids.count(i) > 1})
    node_problems = []
    for i, n in enumerate(nodes):
        if not isinstance(n, dict) or not isinstance(n.get("id"), str):
            node_problems.append(f"node[{i}] has no string id")
            continue
        if not (_is_num(n.get("lat")) and _is_num(n.get("lon"))):
            node_problems.append(f"{n['id']}: lat/lon not finite numbers")
        elif not _in_bbox(float(n["lon"]), float(n["lat"])):
            node_problems.append(f"{n['id']}: outside the Colorado + Utah bounding box")
    if dup_ids:
        node_problems.append("duplicate ids: " + ", ".join(dup_ids))
    if not nodes:
        node_problems.append("no nodes supplied")
    checks.append(_check("C5", "nodes_valid", not node_problems, {"nodes": len(nodes), "problems": node_problems},
                         "all nodes have unique ids and valid CO/UT coordinates" if not node_problems else "; ".join(node_problems)))

    # C6
    per_node = []
    for n in nodes:
        if isinstance(n, dict) and isinstance(n.get("id"), str) and _is_num(n.get("lat")) and _is_num(n.get("lon")) and usable:
            d = distance_to_line_km(float(n["lon"]), float(n["lat"]), coords)
            per_node.append({"id": n["id"], "distance_km": d, "within_buffer": d <= buffer_km})
        elif isinstance(n, dict) and isinstance(n.get("id"), str):
            per_node.append({"id": n["id"], "distance_km": None, "within_buffer": False})
    ok6 = usable and bool(per_node) and all(p["within_buffer"] for p in per_node)
    far = [p["id"] for p in per_node if not p["within_buffer"]]
    checks.append(_check("C6", "nodes_near_corridor", ok6,
                         {"buffer_km": buffer_km, "buffer_miles": buffer_miles, "nodes": per_node},
                         f"every node within {buffer_km:.2f} km of the corridor line" if ok6
                         else ("outside the buffer or unmeasurable: " + ", ".join(far) if per_node else "no nodes measured")))

    fresh = evaluate_freshness(doc.get("freshness"), when)
    freshness = {"limits": fresh["limits"], "sources": fresh["sources"], "blocks_consensus": fresh["blocks_consensus"]}
    checks.append(_check("C7", "data_freshness", fresh["check_status"], freshness, fresh["detail"]))

    sane = evaluate_sanity(doc.get("freshness"), when)
    checks.append(_check("C8", "value_sanity", sane["check_status"],
                         {"checked_items": sane["checked_items"], "problems": sane["problems"], "blocks_consensus": sane["blocks_consensus"]},
                         sane["detail"]))

    passed = sum(1 for c in checks if c["status"] == "PASS")
    failed = sum(1 for c in checks if c["status"] == "FAIL")
    warned = sum(1 for c in checks if c["status"] == "WARN")
    if failed:
        overall = "FAIL"
    elif warned:
        overall = "WARN"
    else:
        overall = "PASS"
    report = {
        "schema_version": SCHEMA_VERSION,
        "validator": {"name": VALIDATOR_NAME, "version": VALIDATOR_VERSION, "language": "python",
                      "python": sys.version.split()[0], "dependencies": "standard library only"},
        "generated_at": when.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "input_sha256": input_sha,
        "parameters": {"bbox": BBOX, "expected_keypoints": EXPECTED_KEYPOINTS, "buffer_miles": buffer_miles,
                       "buffer_km": buffer_km, "earth_radius_km": EARTH_RADIUS_KM},
        "freshness": freshness,
        "checks": checks,
        "summary": {"total": len(checks), "passed": passed, "failed": failed, "warned": warned, "overall": overall},
    }
    return _r(report)


def seal(data, now: datetime | None = None) -> dict:
    """Seal a corridor document. Hashes cover the canonical strings exactly, with no trailing newline."""
    report = build_report(data, now=now)
    canon = canonical_json(report)
    payload = canonical_json(input_document(data if isinstance(data, dict) else {}))
    report_sha = sha256_hex(canon)
    input_sha = sha256_hex(payload)
    kimi_package = {
        "canonicalization": CANONICALIZATION,
        "input_canonical_json": payload,
        "input_sha256": input_sha,
        "report_canonical_json": canon,
        "report_sha256": report_sha,
        "response_schema": RESPONSE_SCHEMA,
    }
    return {
        "report": report,
        "report_sha256": report_sha,
        "report_canonical_json": canon,
        "input_sha256": input_sha,
        "input_canonical_json": payload,
        "canonicalization": CANONICALIZATION,
        "kimi_package": kimi_package,
    }


def main(argv) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        with open(args[0], "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as exc:
        print(json.dumps({"error": f"cannot read input: {exc}"}), file=sys.stderr)
        return 2
    sealed = seal(data)
    print(json.dumps(sealed, indent=2 if "--pretty" in argv else None, ensure_ascii=False))
    return 0 if sealed["report"]["summary"]["overall"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
