#!/usr/bin/env python3
"""
Queen Ant Colony Consensus Engine V3  --  quorum logic (schema_version 1.0)

Pure standard-library Python, deterministic, no network. The HUD's QUEEN ANT AGGREGATOR node
runs exactly this module (through POST /api/consensus) when, and only when, the user presses
"Convene the Queen".

Three seats
  1. Python  : the deterministic validator report (api/_validate_corridor.py). It always "agrees with itself".
  2. Gemini  : an LLM reviewer. It must answer with JSON {"verdict": "agree"|"disagree"|"uncertain", "reason": "..."}.
  3. Kimi    : an independent reviewer. Until Kimi's verdict is supplied the seat is "pending".

A reviewer verdict only counts if reviewed_report_sha256 equals the sha256 of the report being ruled on.
A verdict that cannot be parsed, has an unknown value, or reviewed a different report is "uncertain".

Rulings (checked in this order)
  NO_RULING    the Python report is missing, has a bad hash, or is malformed
  DISSENT      any reviewer says "disagree"   -> who and why are listed
  UNRESOLVED   no disagreement, but a reviewer was "uncertain" or "unavailable" -> never consensus
  CONSENSUS    at least 2 of 3 identical agree payloads, feeds fresh, values sane, fingerprints recompute
  PROVISIONAL  the votes would be CONSENSUS, but a feed is stale, a value failed sanity, or a fingerprint did not recompute
  PENDING      no reviewer has voted yet (1 of 3)

An identical verdict payload is the verdict plus the input and report fingerprints. The reason text is sealed with the vote and is not part of that comparison. A pending seat is a missing voter and is named. A disagreeing seat is dissent and is named. One missing voter does not block CONSENSUS when the other two payloads match. Uncertain and unavailable still block it.

"agree" means: the reviewer agrees that the Python report is a correct and faithful result of its checks.
The Python overall result (PASS or FAIL) is carried in the ruling; a CONSENSUS on a FAIL report is a
consensus that the data FAILED.

ruling_sha256 = SHA-256 of canonical_json(ruling without its ruling_sha256 field).
canonical_json = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

CLI:  python _consensus.py input.json [--pretty]
      input.json = {"report_canonical_json": "...", "report_sha256": "...", "gemini": {...}|null, "kimi": {...}|null}
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone

SCHEMA_VERSION = "1.0"
ENGINE_NAME = "Queen Ant Colony Consensus Engine"
ENGINE_VERSION = "3.0.0"
VERDICTS = ("agree", "disagree", "uncertain")
REVIEWERS = ("gemini", "kimi")
SEATS_TOTAL = 3
MAX_REASON_CHARS = 500


def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


_FENCE = re.compile(r"^```[a-zA-Z]*\s*|\s*```$", re.M)


def parse_reviewer_reply(raw: str) -> dict:
    """Turn a reviewer's raw text into {"verdict", "reason"}. Anything unparseable -> uncertain."""
    if not isinstance(raw, str) or not raw.strip():
        return {"verdict": "uncertain", "reason": "empty reply"}
    text = _FENCE.sub("", raw.strip()).strip()
    candidates = [text]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start:end + 1])
    for cand in candidates:
        try:
            obj = json.loads(cand)
        except ValueError:
            continue
        if isinstance(obj, dict):
            verdict = obj.get("verdict")
            verdict = verdict.strip().lower() if isinstance(verdict, str) else None
            reason = obj.get("reason")
            reason = reason.strip() if isinstance(reason, str) else ""
            if verdict in VERDICTS:
                return {"verdict": verdict, "reason": reason[:MAX_REASON_CHARS] or "(no reason given)"}
            return {"verdict": "uncertain", "reason": "verdict missing or not one of agree/disagree/uncertain"}
    return {"verdict": "uncertain", "reason": "reply was not valid JSON"}


def _normalise_vote(name: str, vote, report_sha: str, expected_input: str | None = None) -> dict:
    """Return {"reviewer", "state", "verdict", "reason", ...}. state: voted | pending | unavailable."""
    if vote is None:
        return {"reviewer": name, "state": "pending", "verdict": None, "reason": f"awaiting {name.capitalize()}"}
    if not isinstance(vote, dict):
        return {"reviewer": name, "state": "voted", "verdict": "uncertain", "reason": "vote was not an object"}
    if vote.get("unavailable") is True:
        return {"reviewer": name, "state": "unavailable", "verdict": None,
                "reason": str(vote.get("reason") or f"{name.capitalize()} unavailable")[:MAX_REASON_CHARS]}
    if "raw_reply" in vote:
        parsed = parse_reviewer_reply(vote.get("raw_reply"))
    else:
        v = vote.get("verdict")
        r = vote.get("reason")
        if v in VERDICTS:
            parsed = {"verdict": v, "reason": (r if isinstance(r, str) and r.strip() else "(no reason given)")[:MAX_REASON_CHARS]}
        else:
            parsed = {"verdict": "uncertain", "reason": "verdict missing or not one of agree/disagree/uncertain"}
    reviewed = vote.get("reviewed_report_sha256")
    reviewed_input = vote.get("reviewed_input_sha256")
    hash_mismatch = False
    if reviewed != report_sha:
        parsed = {"verdict": "uncertain", "reason": "hash mismatch"}
        hash_mismatch = True
    elif isinstance(reviewed_input, str) and reviewed_input != expected_input:
        parsed = {"verdict": "uncertain", "reason": "hash mismatch"}
        hash_mismatch = True
    out = {"reviewer": name, "state": "voted", **parsed, "reviewed_report_sha256": reviewed}
    if hash_mismatch:
        out["hash_mismatch"] = True
    for k in ("model", "reviewed_at"):
        if isinstance(vote.get(k), str):
            out[k] = vote[k][:100]
    return out


def _bad(reason: str, now: datetime) -> dict:
    ruling = {
        "schema_version": SCHEMA_VERSION, "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "convened_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "ruling": "NO_RULING", "label": "NO RULING — " + reason,
        "report_sha256": None, "python_overall": None, "seats": {"total": SEATS_TOTAL, "agreeing": 0},
        "votes": [], "dissent": [],
    }
    ruling["ruling_sha256"] = sha256_hex(canonical_json(ruling))
    return ruling


def _parse_z(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def feed_blocks_consensus(report: dict, now: datetime) -> bool:
    """Recompute fetch age at convene time. A stale or failed layer blocks CONSENSUS."""
    fresh = report.get("freshness") if isinstance(report, dict) else None
    if not isinstance(fresh, dict):
        return True
    sources = fresh.get("sources")
    limits = fresh.get("limits")
    if not isinstance(sources, list) or not isinstance(limits, dict) or not limits:
        return True
    by_id = {src.get("id"): src for src in sources if isinstance(src, dict) and isinstance(src.get("id"), str)}
    for key, cfg in limits.items():
        src = by_id.get(key)
        if not isinstance(src, dict) or src.get("status") == "fail":
            return True
        fetched = _parse_z(src.get("fetched_at"))
        max_age = src.get("max_age_seconds")
        if not isinstance(max_age, (int, float)) or isinstance(max_age, bool):
            max_age = cfg.get("max_age_seconds") if isinstance(cfg, dict) else None
        if fetched is None or not isinstance(max_age, (int, float)) or isinstance(max_age, bool):
            return True
        age = (now - fetched).total_seconds()
        if age < -120 or age > float(max_age):
            return True
    return False


def _flag_hash_mismatch(vote: dict) -> dict:
    if vote.get("state") in ("pending", "unavailable"):
        return vote
    flagged = dict(vote)
    flagged["state"] = "voted"
    flagged["verdict"] = "uncertain"
    flagged["reason"] = "hash mismatch"
    flagged["hash_mismatch"] = True
    return flagged


def _payload(verdict: str, report_sha: str, input_sha) -> dict:
    """The bytes that must match. Reason text stays on the vote and is not part of this object."""
    return {"input_sha256": input_sha, "report_sha256": report_sha, "verdict": verdict}


def sanity_blocks_consensus(report: dict) -> bool:
    checks = report.get("checks") if isinstance(report, dict) else None
    if not isinstance(checks, list):
        return False
    for check in checks:
        if isinstance(check, dict) and check.get("id") == "C8" and check.get("status") == "FAIL":
            return True
    return False


def fingerprint_blocks_consensus(report: dict, payloads) -> bool:
    """Recompute feed fingerprints when a source claims one. A claimed hash with no payload blocks CONSENSUS."""
    fresh = report.get("freshness") if isinstance(report, dict) else None
    sources = fresh.get("sources") if isinstance(fresh, dict) else None
    if not isinstance(sources, list):
        return False
    claimed = [src for src in sources if isinstance(src, dict) and isinstance(src.get("payload_sha256"), str) and isinstance(src.get("id"), str)]
    if not claimed:
        return False
    if not isinstance(payloads, dict):
        return True
    from _ruling import feed_fingerprint
    for src in claimed:
        if feed_fingerprint(payloads.get(src["id"])) != src["payload_sha256"]:
            return True
    return False


def convene(report_canonical_json, report_sha256, gemini=None, kimi=None, now: datetime | None = None,
            input_canonical_json=None, payloads=None) -> dict:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if not isinstance(report_canonical_json, str) or not isinstance(report_sha256, str):
        return _bad("report or hash missing", now)
    if sha256_hex(report_canonical_json) != report_sha256:
        return _bad("report does not match its hash", now)
    try:
        report = json.loads(report_canonical_json)
        overall = report["summary"]["overall"]
        if overall not in ("PASS", "FAIL", "WARN"):
            raise ValueError
    except (ValueError, KeyError, TypeError):
        return _bad("report is malformed", now)

    expected_input = report.get("input_sha256") if isinstance(report.get("input_sha256"), str) else None
    votes = [
        _normalise_vote("gemini", gemini, report_sha256, expected_input),
        _normalise_vote("kimi", kimi, report_sha256, expected_input),
    ]
    input_ok = isinstance(input_canonical_json, str) and isinstance(expected_input, str) and sha256_hex(input_canonical_json) == expected_input
    if not input_ok:
        votes = [_flag_hash_mismatch(v) for v in votes]
    agreeing = 1 + sum(1 for v in votes if v["state"] == "voted" and v["verdict"] == "agree")
    dissent = [{"reviewer": v["reviewer"], "reason": v["reason"]} for v in votes if v["verdict"] == "disagree"]
    unresolved = [v for v in votes if v["state"] == "unavailable" or v["verdict"] == "uncertain"]
    pending = [v["reviewer"] for v in votes if v["state"] == "pending"]
    payloads_by_seat = {"python": _payload("agree", report_sha256, expected_input)}
    for vote in votes:
        if vote["state"] == "voted" and vote.get("verdict") in VERDICTS:
            payloads_by_seat[vote["reviewer"]] = _payload(vote["verdict"], report_sha256, expected_input)
    agree_payload = canonical_json(payloads_by_seat["python"])
    agree_count = sum(1 for item in payloads_by_seat.values() if canonical_json(item) == agree_payload)

    if dissent:
        who = ", ".join(d["reviewer"].capitalize() for d in dissent)
        ruling, label = "DISSENT", f"DISSENT — {who} disagree{'s' if len(dissent) == 1 else ''} with the Python result"
    elif unresolved:
        who = ", ".join(v["reviewer"].capitalize() for v in unresolved)
        ruling, label = "UNRESOLVED", f"UNRESOLVED — {who} uncertain or unavailable ({agreeing} of {SEATS_TOTAL} agree)"
    elif agree_count >= 2:
        ruling = "CONSENSUS"
        if pending:
            missing = ", ".join(name.capitalize() for name in pending)
            label = f"CONSENSUS — {agree_count} of {SEATS_TOTAL} identical agree verdicts; missing: {missing}"
        else:
            label = f"CONSENSUS — all {SEATS_TOTAL} seats agree with the Python result ({overall})"
    elif len(pending) == len(votes):
        ruling, label = "PENDING", f"PENDING — 1 of {SEATS_TOTAL} seats (Python only); no reviewer has voted"
    else:
        ruling = "PROVISIONAL"
        label = f"PROVISIONAL ({agreeing} of {SEATS_TOTAL}, awaiting {', '.join(name.capitalize() for name in pending)})"

    fresh_blocks = feed_blocks_consensus(report, now)
    value_blocks = sanity_blocks_consensus(report)
    hash_blocks = fingerprint_blocks_consensus(report, payloads)
    if ruling == "CONSENSUS" and (fresh_blocks or value_blocks or hash_blocks):
        ruling = "PROVISIONAL"
        reasons = []
        if fresh_blocks:
            reasons.append("stale or failed feed")
        if value_blocks:
            reasons.append("a feed value failed the sanity check")
        if hash_blocks:
            reasons.append("a feed fingerprint did not recompute")
        label = "PROVISIONAL — " + "; ".join(reasons) + "; consensus is not available"

    out = {
        "schema_version": SCHEMA_VERSION, "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "convened_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "ruling": ruling, "label": label,
        "report_sha256": report_sha256, "python_overall": overall,
        "input_hash_ok": input_ok,
        "freshness_blocks_consensus": fresh_blocks,
        "sanity_blocks_consensus": value_blocks,
        "fingerprint_blocks_consensus": hash_blocks,
        "missing_voters": pending,
        "verdict_payloads": payloads_by_seat,
        "seats": {"total": SEATS_TOTAL, "agreeing": agreeing},
        "votes": votes, "dissent": dissent,
    }
    out["ruling_sha256"] = sha256_hex(canonical_json(out))
    return out


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
    r = convene(data.get("report_canonical_json"), data.get("report_sha256"), data.get("gemini"), data.get("kimi"),
                input_canonical_json=data.get("input_canonical_json"), payloads=data.get("payloads"))
    print(json.dumps(r, indent=2 if "--pretty" in argv else None, ensure_ascii=False))
    return 0 if r["ruling"] in ("CONSENSUS", "PROVISIONAL", "PENDING") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
