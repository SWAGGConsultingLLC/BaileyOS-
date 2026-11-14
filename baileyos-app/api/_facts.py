#!/usr/bin/env python3
"""
Shared facts, preferences, and hard personal constraints.

FeasibleFacts is computed here by plain code. Voters do not add, remove, or alter a fact.
Preferences, when a later fit() exists, only rank inside that set and stay in [0, 1].
Hard constraints (mobility, medical, vehicle) are not scores. They stay on the device.
The only shared result is that a plan is infeasible for someone. Not who. Not why.
Crime counts are never a feasibility fact.
"""
from __future__ import annotations

from _consensus import canonical_json, sha256_hex

HARD_CONSTRAINT_KINDS = ("mobility", "medical", "vehicle")
CRIME_LAYER = "crime"

OFFICIAL_SOURCES = (
    {"name": "COtrip", "url": "https://www.cotrip.org/"},
    {"name": "511", "url": "https://www.cotrip.org/"},
    {"name": "NWS", "url": "https://www.weather.gov/"},
)

ADVISORY = (
    "Advisory only. This is not an official alert and it does not clear the road. "
    "Hazards may still be present. Check COtrip, 511, and the National Weather Service."
)

FIT_RANK_NOTE = (
    "Future fit() scores stay in [0, 1] and are rank-based, with one published tie-break. "
    "Two phones that share the same feasible set and the same ranks pick the same plan. "
    "fit() only ranks inside FeasibleFacts. Hard constraints are filters, not scores."
)


def feasible_facts(report) -> dict:
    """Deterministic facts from a validator report. The crime layer is dropped."""
    checks = []
    feeds = []
    if isinstance(report, dict):
        for check in report.get("checks") or []:
            if isinstance(check, dict) and check.get("status") == "PASS" and check.get("id") != CRIME_LAYER:
                checks.append({"id": check.get("id"), "title": check.get("title")})
        fresh = report.get("freshness") if isinstance(report.get("freshness"), dict) else {}
        for src in fresh.get("sources") or []:
            if not isinstance(src, dict) or src.get("id") == CRIME_LAYER:
                continue
            count = src.get("record_count")
            if src.get("status") == "pass" and isinstance(count, int) and not isinstance(count, bool) and count > 0:
                feeds.append(src.get("id"))
    return {
        "computed_by": "deterministic",
        "crime_excluded": True,
        "facts": checks,
        "feeds": feeds,
        "voters_do_not_compute_facts": True,
    }


def hard_constraint_commitment(kind: str, statement: str) -> dict:
    """On-device handle. The statement is hashed and then dropped."""
    if kind not in HARD_CONSTRAINT_KINDS:
        raise ValueError("unknown hard constraint")
    if not isinstance(statement, str) or not statement.strip():
        raise ValueError("statement required")
    commitment = sha256_hex(canonical_json({"kind": kind, "statement": statement}))
    return {"commitment": commitment, "kind": kind}


def apply_hard_filter(plan_ids, constraints) -> dict:
    """Device-side filter. constraints carry a commitment and the plan ids they block. No prose."""
    blocked = []
    plans = [plan for plan in plan_ids if isinstance(plan, str)]
    for item in constraints if isinstance(constraints, list) else []:
        if not isinstance(item, dict) or item.get("kind") not in HARD_CONSTRAINT_KINDS:
            continue
        if not isinstance(item.get("commitment"), str):
            continue
        for plan in item.get("blocks") or []:
            if isinstance(plan, str) and plan in plans and plan not in blocked:
                blocked.append(plan)
    blocked.sort()
    return {
        "feasible": [plan for plan in plans if plan not in blocked],
        "infeasible_for_someone": blocked,
    }


def shared_infeasible(filtered) -> dict:
    """What may leave the device. Plan ids only."""
    plans = filtered.get("infeasible_for_someone") if isinstance(filtered, dict) else []
    return {"infeasible_for_someone": [plan for plan in plans if isinstance(plan, str)]}


def hazard_notice(code: str):
    """Advisory for a NO_SAFE_PLAN or hazard screen. Not an official all-clear."""
    if code not in ("NO_SAFE_PLAN", "HAZARD"):
        return None
    return {
        "advisory": ADVISORY,
        "code": code,
        "official_alert": False,
        "sources": [dict(source) for source in OFFICIAL_SOURCES],
    }
