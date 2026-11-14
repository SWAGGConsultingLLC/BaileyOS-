#!/usr/bin/env python3
"""
Tamper-evident decision record  (schema_version 1.1, verify still accepts 1.0)

The seal shows the record was not altered after sealing.
It does not show the decision was correct or that the data was accurate.

Chain formula for 1.1: R_n = H(canonical{ruling_n, F, R_prev}).
input_sha256, report_sha256, and feed_sha256 stay in F.
prev_record_sha256 is R_prev. record_sha256 is R_n.

The chain holds fingerprints, validator votes, freshness results, the ruling,
and timestamps. It has no user id and no location. A separate linkage list
can remember who asked and their coarsened area. Deleting that list does not
change the chain.

Two people on the same trip still do not share a profile. This module never
reads a birth year, a self-identified label, or a home region.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

from _consensus import canonical_json, sha256_hex

SCHEMA_VERSION = "1.1"
CHAIN_FORMULA = "R_n = H(canonical{ruling_n, F, R_prev})"
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


def chain_preimage(record: dict) -> dict:
    """The object whose canonical bytes are R_n. record_sha256 is not inside it."""
    return {
        "F": {
            "feed_sha256": record.get("feed_sha256") or {},
            "input_sha256": record.get("input_sha256"),
            "report_sha256": record.get("report_sha256"),
        },
        "R_prev": record.get("prev_record_sha256"),
        "ruling_n": {
            "chain_formula": CHAIN_FORMULA,
            "created_at": record.get("created_at"),
            "dissent": record.get("dissent") or [],
            "fingerprints_ok": record.get("fingerprints_ok"),
            "freshness": record.get("freshness"),
            "kind": record.get("kind"),
            "missing_voters": record.get("missing_voters") or [],
            "note": record.get("note"),
            "queen": record.get("queen"),
            "queen_sha256": record.get("queen_sha256"),
            "sanity": record.get("sanity"),
            "schema_version": record.get("schema_version"),
            "sequence_number": record.get("sequence_number"),
            "verdicts": record.get("verdicts"),
        },
    }


def _sanity_view(report: dict) -> dict:
    checks = report.get("checks") if isinstance(report, dict) else None
    if not isinstance(checks, list):
        return {"detail": "this report has no value sanity check", "status": "ABSENT"}
    for check in checks:
        if isinstance(check, dict) and check.get("id") == "C8":
            status = check.get("status") if check.get("status") in ("PASS", "FAIL", "WARN") else "ABSENT"
            return {"detail": str(check.get("detail") or "")[:500], "status": status}
    return {"detail": "this report has no value sanity check", "status": "ABSENT"}


def _seal_v11(record: dict) -> dict:
    found = banned_keys(record)
    if found:
        raise ValueError("record contains user linkage: " + ", ".join(found))
    record["chain_formula"] = CHAIN_FORMULA
    record["record_sha256"] = sha256_hex(canonical_json(chain_preimage(record)))
    return record


def build_genesis_record(now: datetime | None = None) -> dict:
    """Explicit first record. Sequence 1. No parent. Not a Queen ruling."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    queen_view = {
        "convened_at": stamp,
        "label": "GENESIS — the chain starts here",
        "python_overall": None,
        "ruling": "GENESIS",
        "seats": {"agreeing": 0, "total": 3},
        "source_ruling_sha256": None,
    }
    record = {
        "schema_version": SCHEMA_VERSION,
        "kind": RECORD_KIND,
        "created_at": stamp,
        "sequence_number": 1,
        "prev_record_sha256": None,
        "input_sha256": sha256_hex(canonical_json({"genesis": True, "part": "input"})),
        "report_sha256": sha256_hex(canonical_json({"genesis": True, "part": "report"})),
        "feed_sha256": {},
        "verdicts": [],
        "dissent": [],
        "missing_voters": [],
        "freshness": {"blocks_consensus": False, "limits": {}, "sources": []},
        "sanity": {"detail": "genesis has no feed values", "status": "PASS"},
        "fingerprints_ok": True,
        "queen": queen_view,
        "queen_sha256": sha256_hex(canonical_json(queen_view)),
        "note": SEAL_NOTE,
        "chain_formula": CHAIN_FORMULA,
    }
    return _seal_v11(record)


def build_ruling_record(sealed: dict, queen: dict, prev_record_sha256=None, sequence_number=None, now: datetime | None = None) -> dict:
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
    parent = prev_record_sha256 if _hex64(prev_record_sha256) else None
    if isinstance(sequence_number, int) and not isinstance(sequence_number, bool) and sequence_number >= 1:
        seq = sequence_number
    else:
        seq = 1 if parent is None else None
    missing = [name for name in (queen.get("missing_voters") or []) if isinstance(name, str)]
    dissent = []
    for row in queen.get("dissent") or []:
        if isinstance(row, dict) and isinstance(row.get("reviewer"), str):
            dissent.append({"reason": str(row.get("reason") or "")[:500], "reviewer": row["reviewer"]})
    record = {
        "schema_version": SCHEMA_VERSION,
        "kind": RECORD_KIND,
        "created_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sequence_number": seq,
        "prev_record_sha256": parent,
        "input_sha256": sealed.get("input_sha256"),
        "report_sha256": sealed.get("report_sha256"),
        "feed_sha256": feeds,
        "verdicts": verdicts,
        "dissent": dissent,
        "missing_voters": missing,
        "freshness": _freshness_view(report),
        "sanity": _sanity_view(report),
        "fingerprints_ok": queen.get("fingerprint_blocks_consensus") is not True,
        "queen": queen_view,
        "queen_sha256": sha256_hex(canonical_json(queen_view)),
        "note": SEAL_NOTE,
        "chain_formula": CHAIN_FORMULA,
    }
    return _seal_v11(record)


def _verify_common(record) -> list:
    problems = []
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
    found = banned_keys({k: v for k, v in record.items() if k != "record_sha256"})
    if found:
        problems.append("user linkage in the record: " + ", ".join(sorted(set(found))))
    prev = record.get("prev_record_sha256")
    if prev is not None and not _hex64(prev):
        problems.append("prev_record_sha256 is not a sha256 hex string")
    return problems


def verify_ruling_record(record) -> dict:
    problems = []
    if not isinstance(record, dict) or record.get("kind") != RECORD_KIND:
        return {"ok": False, "problems": ["not a baileyos ruling record"], "note": SEAL_NOTE}
    version = record.get("schema_version")
    claimed = record.get("record_sha256")
    if version == "1.0":
        body = {k: v for k, v in record.items() if k != "record_sha256"}
        recomputed = sha256_hex(canonical_json(body))
    elif version == "1.1":
        recomputed = sha256_hex(canonical_json(chain_preimage(record)))
        seq = record.get("sequence_number")
        if not isinstance(seq, int) or isinstance(seq, bool) or seq < 1:
            problems.append("sequence_number is missing")
        missing = record.get("missing_voters")
        if not isinstance(missing, list) or any(not isinstance(name, str) for name in missing):
            problems.append("missing_voters is not a list of names")
        if record.get("chain_formula") != CHAIN_FORMULA:
            problems.append("chain formula mismatch")
    else:
        return {"ok": False, "problems": ["unknown schema_version"], "note": SEAL_NOTE, "record_sha256": None}
    if claimed != recomputed:
        problems.append("record_sha256 mismatch")
    problems.extend(_verify_common(record))
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


class ChainConflict(Exception):
    """The head moved between the read and the write. The caller retries."""


def append_with_retry(read_head, write, build, attempts: int = 5):
    """read_head() -> (prev_hash or None, sequence_of_head or 0). write raises ChainConflict on a stale head."""
    last = None
    tries = attempts if isinstance(attempts, int) and attempts > 0 else 5
    for _ in range(tries):
        prev, seq = read_head()
        parent = prev if _hex64(prev) else None
        number = seq + 1 if isinstance(seq, int) and not isinstance(seq, bool) and seq >= 0 else 1
        record = build(parent, number)
        try:
            write(record)
            return record
        except ChainConflict as exc:
            last = exc
    raise ChainConflict(str(last) if last else "chain head moved")


def verify_chain(records) -> dict:
    """Recompute every seal and reject two records that claim the same parent."""
    problems = []
    if not isinstance(records, list):
        return {"ok": False, "fork": False, "problems": ["records must be a list"], "head": None, "length": 0}
    if not records:
        return {"ok": True, "fork": False, "problems": [], "head": None, "length": 0}
    parents: dict = {}
    for record in records:
        if not isinstance(record, dict):
            problems.append("seal mismatch")
            continue
        checked = verify_ruling_record(record)
        if not checked["ok"]:
            problems.append("seal mismatch")
        prev = record.get("prev_record_sha256")
        if isinstance(prev, str):
            parents[prev] = parents.get(prev, 0) + 1
    for count in parents.values():
        if count > 1:
            problems.append("fork: two records claim the same prev_record_sha256")
            break
    genesis = [record for record in records if isinstance(record, dict) and record.get("prev_record_sha256") is None]
    if len(genesis) > 1:
        problems.append("fork: more than one record has no parent")
    numbered = [record for record in records if isinstance(record, dict) and isinstance(record.get("sequence_number"), int) and not isinstance(record.get("sequence_number"), bool)]
    head = None
    if len(numbered) == len(records) and numbered:
        ordered = sorted(numbered, key=lambda record: record["sequence_number"])
        seqs = [record["sequence_number"] for record in ordered]
        if seqs != list(range(seqs[0], seqs[0] + len(seqs))):
            problems.append("sequence numbers are not contiguous")
        for earlier, later in zip(ordered, ordered[1:]):
            if later.get("prev_record_sha256") != earlier.get("record_sha256"):
                problems.append("prev link does not match the previous record")
        head = ordered[-1].get("record_sha256")
    fork = any(str(item).startswith("fork") for item in problems)
    return {"ok": not problems, "fork": fork, "problems": problems, "head": head, "length": len(records)}


def _record_time(record):
    if not isinstance(record, dict):
        return None
    return _parse_stamp(record.get("created_at"))


def _parse_stamp(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _verdict_name(record, reviewer: str):
    if not isinstance(record, dict):
        return None
    for verdict in record.get("verdicts") or []:
        if isinstance(verdict, dict) and verdict.get("reviewer") == reviewer and verdict.get("verdict") in ("agree", "disagree", "uncertain"):
            return verdict.get("verdict")
    return None


def pairwise_agreement(records, now: datetime | None = None, days: int = 30) -> dict:
    """Read-only 30-day rates. Not used to decide CONSENSUS. Agreement is not correctness."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    window = days if isinstance(days, int) and not isinstance(days, bool) and days > 0 else 30
    cutoff = now - timedelta(days=window)
    seats = ("python", "gemini", "kimi")
    considered = []
    for record in records if isinstance(records, list) else []:
        stamp = _record_time(record)
        ruling = record.get("queen", {}).get("ruling") if isinstance(record, dict) and isinstance(record.get("queen"), dict) else None
        if stamp is None or stamp < cutoff or ruling == "GENESIS":
            continue
        considered.append(record)
    pairs = []
    for index, left in enumerate(seats):
        for right in seats[index + 1:]:
            compared = 0
            agreed = 0
            for record in considered:
                a = _verdict_name(record, left)
                b = _verdict_name(record, right)
                if a is None or b is None:
                    continue
                compared += 1
                if a == b:
                    agreed += 1
            pairs.append({
                "a": left,
                "agreed": agreed,
                "b": right,
                "compared": compared,
                "rate": (agreed / compared) if compared else None,
            })
    return {
        "note": "Read only. Agreement is not correctness. This rate is not used to decide CONSENSUS.",
        "pairs": pairs,
        "used_for_quorum": False,
        "window_days": window,
    }


def _light(state: str, line: str, **extra) -> dict:
    return {"line": line, "state": state, **extra}


def continuity_lights(records, configured: bool = True, anchored_today: bool = False, now: datetime | None = None, error: str | None = None) -> dict:
    """Three lights plus the continuity lock. The lock is LOCKED only when all three are green and today's head is anchored outside this system."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    computed = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    anchor_line = "today's head is anchored outside this system" if anchored_today else "anchor not published"

    def pending(reason: str) -> dict:
        return {
            "anchor_line": anchor_line,
            "anchored_today": False,
            "chain_integrity": _light("PENDING", reason),
            "computed_at": computed,
            "consensus": _light("PENDING", reason, consensus_count=None, total=None),
            "continuity_lock": "PENDING",
            "feed_health": _light("PENDING", reason),
            "head_sha256": None,
            "lock_line": "PENDING — " + reason,
            "pairwise": pairwise_agreement([], now, 30),
        }

    if error:
        return pending(error)
    if not configured:
        return pending("The ruling log is not configured.")
    if not isinstance(records, list):
        return pending("The ruling log could not be read.")

    chain = verify_chain(records)
    cutoff = now - timedelta(days=30)
    recent = []
    for record in records:
        if not isinstance(record, dict):
            continue
        ruling = record.get("queen", {}).get("ruling") if isinstance(record.get("queen"), dict) else None
        stamp = _record_time(record)
        if ruling == "GENESIS" or stamp is None or stamp < cutoff:
            continue
        if not verify_ruling_record(record)["ok"]:
            continue
        recent.append(record)
    consensus_count = sum(1 for record in recent if isinstance(record.get("queen"), dict) and record["queen"].get("ruling") == "CONSENSUS")
    total = len(recent)
    if total == 0:
        consensus = _light("PENDING", "No rulings in the last 30 days.", consensus_count=0, total=0)
    else:
        state = "GREEN" if consensus_count * 3 >= total * 2 else "RED"
        consensus = _light(state, f"{consensus_count} of {total} CONSENSUS over 30 days.", consensus_count=consensus_count, total=total)

    def feed_bad(record) -> str | None:
        fresh = record.get("freshness") if isinstance(record.get("freshness"), dict) else {}
        if fresh.get("blocks_consensus") is True:
            return "stale"
        for src in fresh.get("sources") or []:
            if isinstance(src, dict) and src.get("status") == "fail":
                return "stale"
        sanity = record.get("sanity") if isinstance(record.get("sanity"), dict) else {"status": "ABSENT"}
        if sanity.get("status") == "FAIL":
            return "sanity"
        if sanity.get("status") == "ABSENT":
            return "absent"
        if record.get("fingerprints_ok") is False:
            return "fingerprint"
        return None

    if not recent:
        feed = _light("PENDING", "No ruling to check yet.")
    else:
        marks = [feed_bad(record) for record in recent]
        if any(mark in ("stale", "sanity", "fingerprint") for mark in marks):
            feed = _light("RED", "A ruling in the last 30 days has a feed that is stale, failed, or outside the sanity ranges.")
        elif any(mark == "absent" for mark in marks):
            feed = _light("PENDING", "A recent ruling has no value sanity check.")
        else:
            feed = _light("GREEN", "Recent rulings were fresh and inside the sanity ranges.")

    if not records:
        chain_light = _light("PENDING", "No records to recompute yet.")
    elif chain["ok"]:
        chain_light = _light("GREEN", "Every record recomputes, the links match, and there is no fork.")
    elif chain["fork"]:
        chain_light = _light("RED", "A record claims the same parent as another record.")
    else:
        chain_light = _light("RED", "A record seal does not recompute.")

    states = (consensus["state"], feed["state"], chain_light["state"])
    if states == ("GREEN", "GREEN", "GREEN") and anchored_today:
        lock = "LOCKED"
        lock_line = "LOCKED — all three lights are green and today's head is anchored outside this system."
    elif "RED" in states:
        lock = "PENDING"
        lock_line = "PENDING — a light is red, and the anchor is not published." if not anchored_today else "PENDING — a light is red."
    else:
        lock = "PENDING"
        lock_line = "PENDING — anchor not published" if not anchored_today else "PENDING — a light is not green."

    return {
        "anchor_line": anchor_line,
        "anchored_today": bool(anchored_today),
        "chain_integrity": chain_light,
        "computed_at": computed,
        "consensus": consensus,
        "continuity_lock": lock,
        "feed_health": feed,
        "head_sha256": chain.get("head") if chain.get("ok") else None,
        "lock_line": lock_line,
        "pairwise": pairwise_agreement(records, now, 30),
    }
