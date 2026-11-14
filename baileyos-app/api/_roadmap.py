#!/usr/bin/env python3
"""
Interfaces for Landing Stone steps that are not built yet.

Nothing here posts, generates keys, opens a socket, or changes a record.
"""
from __future__ import annotations


def publish_git_anchor(anchor, approval=None) -> dict:
    """Step 4. A public Git commit of the daily head. Owner approval is required every time. This does not commit or push."""
    day = anchor.get("day") if isinstance(anchor, dict) else None
    approved = isinstance(approval, dict) and approval.get("owner_approved") is True and approval.get("day") == day and isinstance(day, str)
    return {
        "accepts": [
            "anchor from daily_anchor: day, head_sha256, record_count, daily_sha256",
            "a fresh owner approval whose day equals that anchor day",
        ],
        "approval_present": approved,
        "auto_post": False,
        "implemented": False,
        "needs_owner_approval": True,
        "published": False,
        "reason": "Git anchoring is not built. Nothing was committed or pushed.",
        "second_witness_later": "A transparency log such as Sigstore Rekor can be a later witness. It is not this step.",
    }


def trip_handshake_interface() -> dict:
    """Step 5. QR plus a spoken SAS check. Documented only."""
    return {
        "cannot_add_someone_else": True,
        "consent": "both devices confirm before either joins the trip",
        "implemented": False,
        "key_agreement": "ephemeral X25519",
        "leave": "one tap on either device",
        "live": False,
        "members_visible": True,
        "nonce": "random, expires, single redemption",
        "trip_genesis": "G = H(canonical{pub_A, pub_B, nonce})",
    }
