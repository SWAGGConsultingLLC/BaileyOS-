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

Hashes (so a reviewer can prove which bytes were checked)
  input_sha256   = SHA-256 of canonical_json({"corridor":..., "nodes":...})
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
    return {"id": cid, "title": title, "status": "PASS" if status else "FAIL", "value": value, "detail": detail}


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
    corridor = data.get("corridor") if isinstance(data, dict) else None
    nodes = data.get("nodes") if isinstance(data, dict) else None
    nodes = nodes if isinstance(nodes, list) else []
    if len(nodes) > MAX_INPUT_NODES:
        nodes = nodes[:MAX_INPUT_NODES]

    input_sha = sha256_hex(canonical_json({"corridor": corridor, "nodes": nodes}))
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

    passed = sum(1 for c in checks if c["status"] == "PASS")
    when = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    report = {
        "schema_version": SCHEMA_VERSION,
        "validator": {"name": VALIDATOR_NAME, "version": VALIDATOR_VERSION, "language": "python",
                      "python": sys.version.split()[0], "dependencies": "standard library only"},
        "generated_at": when.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "input_sha256": input_sha,
        "parameters": {"bbox": BBOX, "expected_keypoints": EXPECTED_KEYPOINTS, "buffer_miles": buffer_miles,
                       "buffer_km": buffer_km, "earth_radius_km": EARTH_RADIUS_KM},
        "checks": checks,
        "summary": {"total": len(checks), "passed": passed, "failed": len(checks) - passed,
                    "overall": "PASS" if passed == len(checks) else "FAIL"},
    }
    return _r(report)


def seal(report: dict) -> dict:
    """Return {report, report_sha256, report_canonical_json}. The hash covers the canonical string exactly."""
    canon = canonical_json(report)
    return {"report": report, "report_sha256": sha256_hex(canon), "report_canonical_json": canon}


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
    sealed = seal(build_report(data))
    print(json.dumps(sealed, indent=2 if "--pretty" in argv else None, ensure_ascii=False))
    return 0 if sealed["report"]["summary"]["overall"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
