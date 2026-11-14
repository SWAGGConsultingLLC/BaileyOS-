#!/usr/bin/env python3
"""
Tamper-evident decision record  (schema_version 1.0)

The seal shows the record was not altered after sealing.
It does not show the decision was correct or that the data was accurate.

The chain holds fingerprints, validator votes, freshness results, the ruling,
and timestamps. It has no user id and no location. A separate linkage list
can remember who asked and their coarsened area. Deleting that list does not
change the chain.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

from _consensus import canonical_json, sha256_hex

SCHEMA_VERSION = "1.0"
RECORD_KIND = "baileyos.ruling_record"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
LINKAGE_DAYS = 28
SEAL_NOTE = (
    "This is a tamper-evident decision record. "
    "The seal shows the record was not altered after sealing. "
    "It does not show the decision was correct or that the data was accurate."
)
BANNED_KEYS = {
    "accuracy", "accuracy_m", "altitude", "area", "coarse_lat", "coarse_lon",
    "gps", "heading", "lat", "latitude", "lon", "longitude", "precise",
    "speed", "speed_mps", "user_id", "user_lat", "user_lon",
}


def _hex64(value) -> bool:
    return isinstance(value, str) and bool(HEX64.match(value))


def _walk_keys(value, found: list):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in BANNED_KEYS:
                found.append(key)
            else:
                _walk_keys(item, found)
    elif isinstance(value, list):
        for item in value:
            _walk_keys(item, found)


def banned_keys(record) -> list:
    found: list = []
    _walk_keys(record, found)
    return found


def feed_fingerprint(items) -> str:
    """Hash of a feed payload. Coordinates are not part of the fingerprint."""
    slim = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        slim.append({
            "agency": item.get("agency"),
            "expires_at": item.get("expires_at", item.get("expiresAt")),
            "id": item.get("id"),
            "issued_at": item.get("issued_at", item.get("issuedAt")),
            "kind": item.get("kind"),
            "title": item.get("title"),
        })
    slim.sort(key=lambda row: str(row.get("id")))
    return sha256_hex(canonical_json(slim))


def attach_feed_fingerprints(freshness, payloads) -> dict:
    table = dict(freshness) if isinstance(freshness, dict) else {}
    payloads = payloads if isinstance(payloads, dict) else {}
    out = {}
    for key, row in table.items():
        copied = dict(row) if isinstance(row, dict) else {"available": False, "record_count": 0}
        if key in payloads:
            copied["payload_sha256"] = feed_fingerprint(payloads.get(key))
        out[key] = copied
    return out


def _verdict(reviewer: str, verdict: str, reason: str) -> dict:
    body = {"reason": (reason or "")[:500], "reviewer": reviewer, "verdict": verdict}
    body["verdict_sha256"] = sha256_hex(canonical_json({k: v for k, v in body.items() if k != "verdict_sha256"}))
    return body


def _freshness_view(report: dict) -> dict:
    fresh = report.get("freshness") if isinstance(report, dict) else None
    if not isinstance(fresh, dict):
        return {"limits": {}, "sources": []}
    sources = []
    for src in fresh.get("sources") or []:
        if not isinstance(src, dict):
            continue
        sources.append({
            "detail": src.get("detail"),
            "fetch_age_seconds": src.get("fetch_age_seconds"),
            "fetched_at": src.get("fetched_at"),
            "id": src.get("id"),
            "max_age_seconds": src.get("max_age_seconds"),
            "payload_sha256": src.get("payload_sha256"),
            "record_count": src.get("record_count"),
            "source_age_seconds": src.get("source_age_seconds"),
            "source_timestamp": src.get("source_timestamp"),
            "status": src.get("status"),
        })
    return {"blocks_consensus": fresh.get("blocks_consensus"), "limits": fresh.get("limits") or {}, "sources": sources}


def build_ruling_record(sealed: dict, queen: dict, prev_record_sha256=None, now: datetime | None = None) -> dict:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    report = sealed.get("report") if isinstance(sealed.get("report"), dict) else {}
    verdicts = [_verdict("python", "agree", "Python produced this report and agrees with its own checks.")]
    for vote in queen.get("votes") or []:
        if not isinstance(vote, dict):
            continue
        state = vote.get("state")
        if state == "pending":
            verdict = "pending"
        elif state == "unavailable":
            verdict = "unavailable"
        else:
            verdict = vote.get("verdict") if vote.get("verdict") in ("agree", "disagree", "uncertain") else "uncertain"
        verdicts.append(_verdict(str(vote.get("reviewer") or "reviewer"), verdict, str(vote.get("reason") or "")))
    feeds = {}
    for src in _freshness_view(report)["sources"]:
        if _hex64(src.get("payload_sha256")):
            feeds[src["id"]] = src["payload_sha256"]
    queen_view = {
        "convened_at": queen.get("convened_at"),
        "label": queen.get("label"),
        "python_overall": queen.get("python_overall"),
        "ruling": queen.get("ruling"),
        "seats": queen.get("seats"),
        "source_ruling_sha256": queen.get("ruling_sha256"),
    }
    record = {
        "schema_version": SCHEMA_VERSION,
        "kind": RECORD_KIND,
        "created_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "prev_record_sha256": prev_record_sha256 if _hex64(prev_record_sha256) else None,
        "input_sha256": sealed.get("input_sha256"),
        "report_sha256": sealed.get("report_sha256"),
        "feed_sha256": feeds,
        "verdicts": verdicts,
        "freshness": _freshness_view(report),
        "queen": queen_view,
        "queen_sha256": sha256_hex(canonical_json(queen_view)),
        "note": SEAL_NOTE,
    }
    found = banned_keys(record)
    if found:
        raise ValueError("record contains user linkage: " + ", ".join(found))
    record["record_sha256"] = sha256_hex(canonical_json(record))
    return record


def verify_ruling_record(record) -> dict:
    problems = []
    if not isinstance(record, dict) or record.get("kind") != RECORD_KIND:
        return {"ok": False, "problems": ["not a baileyos ruling record"], "note": SEAL_NOTE}
    claimed = record.get("record_sha256")
    body = {k: v for k, v in record.items() if k != "record_sha256"}
    recomputed = sha256_hex(canonical_json(body))
    if claimed != recomputed:
        problems.append("record_sha256 mismatch")
    queen = record.get("queen")
    if not isinstance(queen, dict) or sha256_hex(canonical_json(queen)) != record.get("queen_sha256"):
        problems.append("queen_sha256 mismatch")
    for verdict in record.get("verdicts") or []:
        if not isinstance(verdict, dict):
            problems.append("verdict is not an object")
            continue
        bare = {k: v for k, v in verdict.items() if k != "verdict_sha256"}
        if sha256_hex(canonical_json(bare)) != verdict.get("verdict_sha256"):
            problems.append("verdict hash mismatch: " + str(verdict.get("reviewer")))
    for name in ("input_sha256", "report_sha256"):
        if not _hex64(record.get(name)):
            problems.append(name + " is not a fingerprint")
    found = banned_keys(body)
    if found:
        problems.append("user linkage in the record: " + ", ".join(sorted(set(found))))
    prev = record.get("prev_record_sha256")
    if prev is not None and not _hex64(prev):
        problems.append("prev_record_sha256 is not a sha256 hex string")
    return {"ok": not problems, "problems": problems, "record_sha256": recomputed, "note": SEAL_NOTE}


def make_linkage(user_id: str, record_sha256: str, lat, lon, created_at: str) -> dict:
    """Outside the chain. Safe to delete."""
    return {
        "user_id": user_id,
        "record_sha256": record_sha256,
        "coarse_lat": round(float(lat), 2),
        "coarse_lon": round(float(lon), 2),
        "created_at": created_at,
    }


def delete_linkage_for_user(rows, user_id: str) -> list:
    return [row for row in rows if not (isinstance(row, dict) and row.get("user_id") == user_id)]


def purge_linkage(rows, now: datetime, days: int = LINKAGE_DAYS) -> list:
    now = now.astimezone(timezone.utc)
    cutoff = now - timedelta(days=days)
    kept = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        created = row.get("created_at")
        if not isinstance(created, str) or not created.endswith("Z"):
            continue
        try:
            stamp = datetime.strptime(created, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if stamp >= cutoff:
            kept.append(row)
    return kept


def daily_anchor(day: str, head_sha256, record_count: int) -> dict:
    body = {"day": day, "head_sha256": head_sha256 if _hex64(head_sha256) else None, "record_count": int(record_count)}
    return {
        **body,
        "daily_sha256": sha256_hex(canonical_json(body)),
        "note": SEAL_NOTE,
        "trust": "The seal guards against outsiders changing a record after it was sealed. Anchoring this daily head outside our own systems is what guards against our own system. Publishing that anchor needs the owner's approval.",
    }


def publish_anchor(anchor: dict) -> dict:
    """Hook only. This does not post anywhere."""
    return {
        "published": False,
        "needs_owner_approval": True,
        "reason": "Publishing needs the owner's approval. Nothing was posted.",
        "daily_sha256": anchor.get("daily_sha256") if isinstance(anchor, dict) else None,
    }
