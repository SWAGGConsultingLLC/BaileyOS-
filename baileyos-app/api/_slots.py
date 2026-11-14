#!/usr/bin/env python3
"""Slot registry for Landing Stone voters. Tier comes from the config file. No prices."""
from __future__ import annotations

import json
import os

from _consensus import canonical_json, sha256_hex

_REGISTRY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "validation", "voter_slots.json")
REVIEWER_SLOT = {"gemini": "B", "kimi": "D", "grok": "A", "github": "C", "claude": "E"}


def load_registry() -> dict:
    with open(_REGISTRY_PATH, encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {"quorum": 3, "slots": []}


def ordered_slots(slots=None) -> list:
    rows = slots if isinstance(slots, list) else load_registry().get("slots") or []
    free = [slot for slot in rows if isinstance(slot, dict) and slot.get("tier") == "free"]
    paid = [slot for slot in rows if isinstance(slot, dict) and slot.get("tier") == "paid"]
    return free + paid


def slot_status(slot: dict, env_has_key: bool) -> str:
    if slot.get("enabled") is not True:
        return "disabled"
    if slot.get("env") and not env_has_key:
        return "not configured"
    return "ready"


def voter_roster(env_flags=None, answers=None, python_fingerprint=None, slots=None) -> list:
    """Free slots first. A missing key is not configured and has no answer hash."""
    env_flags = env_flags if isinstance(env_flags, dict) else {}
    answers = answers if isinstance(answers, dict) else {}
    quorum = load_registry().get("quorum")
    limit = quorum if isinstance(quorum, int) and quorum > 0 else 3
    rows = [{
        "answer_sha256": python_fingerprint if isinstance(python_fingerprint, str) else None,
        "id": "python",
        "in_quorum": True,
        "name": "Python validator",
        "status": "voted",
        "tier": "free",
    }]
    for slot in ordered_slots(slots):
        env_name = slot.get("env")
        present = bool(env_flags.get(env_name)) if isinstance(env_name, str) else False
        status = slot_status(slot, present)
        answer = answers.get(slot.get("id"))
        digest = None
        if status == "ready" and isinstance(answer, str) and answer.strip():
            status = "voted"
            digest = sha256_hex(answer)
        rows.append({
            "answer_sha256": digest,
            "id": slot.get("id"),
            "in_quorum": False,
            "name": slot.get("name"),
            "status": status,
            "tier": slot.get("tier"),
        })
    chosen = []
    for row in rows:
        if row["status"] in ("voted", "ready") and row["tier"] == "free":
            chosen.append(row)
        if len(chosen) >= limit:
            break
    if len(chosen) < limit:
        for row in rows:
            if row in chosen:
                continue
            if row["status"] in ("voted", "ready") and row["tier"] == "paid":
                chosen.append(row)
            if len(chosen) >= limit:
                break
    chosen_ids = {row["id"] for row in chosen}
    for row in rows:
        row["in_quorum"] = row["id"] in chosen_ids
    return rows


def answers_from_queen(queen: dict) -> dict:
    found = {}
    if not isinstance(queen, dict):
        return found
    for vote in queen.get("votes") or []:
        if not isinstance(vote, dict) or vote.get("state") != "voted":
            continue
        slot_id = REVIEWER_SLOT.get(str(vote.get("reviewer") or ""))
        if not slot_id:
            continue
        body = {key: value for key, value in vote.items() if key != "verdict_sha256"}
        found[slot_id] = canonical_json(body)
    return found
