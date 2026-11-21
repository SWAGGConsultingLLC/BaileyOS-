"""Run: python -m unittest validation.test_slots   (from baileyos-app/)"""
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "api"))
from _consensus import sha256_hex  # noqa: E402
from _slots import ordered_slots, voter_roster  # noqa: E402
from _validate_corridor import seal  # noqa: E402
from _consensus import convene  # noqa: E402
from _ruling import build_ruling_record, verify_ruling_record  # noqa: E402

NOW_SAMPLE = json.load(open(os.path.join(HERE, "sample_input.json"), encoding="utf-8"))


class SlotRegistryTests(unittest.TestCase):
    def test_free_slots_precede_paid_and_a_missing_key_is_not_a_vote(self):
        order = [slot["id"] for slot in ordered_slots()]
        self.assertEqual(order, ["A", "B", "C", "D", "E"])
        rows = voter_roster({}, {"D": "a paid answer that must not be sealed"}, python_fingerprint="ab" * 32)
        self.assertEqual([row["id"] for row in rows], ["python", "A", "B", "C", "D", "E"])
        self.assertEqual([row["tier"] for row in rows], ["free", "free", "free", "free", "paid", "paid"])
        kimi = next(row for row in rows if row["id"] == "D")
        self.assertEqual(kimi["status"], "disabled")
        self.assertIsNone(kimi["answer_sha256"])
        self.assertNotIn("a paid answer", json.dumps(rows))
        grok = next(row for row in rows if row["id"] == "A")
        self.assertEqual(grok["status"], "not configured")
        self.assertIsNone(grok["answer_sha256"])
        self.assertTrue(rows[0]["in_quorum"])
        self.assertFalse(kimi["in_quorum"])

    def test_an_enabled_paid_slot_with_a_key_votes_after_free_slots(self):
        slots = json.loads(json.dumps(ordered_slots()))
        for slot in slots:
            if slot["id"] == "D":
                slot["enabled"] = True
        rows = voter_roster(
            {"MOONSHOT_API_KEY": True, "XAI_API_KEY": True, "GEMINI_API_KEY": True},
            {"A": "free answer", "D": "paid answer"},
            slots=slots,
        )
        voted = [row["id"] for row in rows if row["status"] == "voted"]
        self.assertEqual(voted[:2], ["python", "A"])
        kimi = next(row for row in rows if row["id"] == "D")
        self.assertEqual(kimi["status"], "voted")
        self.assertEqual(kimi["answer_sha256"], sha256_hex("paid answer"))
        self.assertLess(rows.index(next(row for row in rows if row["id"] == "A")), rows.index(kimi))
        quorum = [row["id"] for row in rows if row["in_quorum"]]
        self.assertEqual(quorum, ["python", "A", "B"])
        self.assertNotIn("D", quorum)

    def test_a_ruling_seals_slot_tiers_and_not_a_key(self):
        from datetime import datetime, timezone
        now = datetime(2026, 11, 14, 12, 1, tzinfo=timezone.utc)
        sealed = seal(NOW_SAMPLE, now=now)
        digest = sealed["report_sha256"]
        inp = sealed["input_sha256"]
        vote = {"verdict": "agree", "reason": "ok", "reviewed_report_sha256": digest, "reviewed_input_sha256": inp}
        queen = convene(sealed["report_canonical_json"], digest, vote, None, now=now, input_canonical_json=sealed["input_canonical_json"])
        record = build_ruling_record(sealed, queen, sequence_number=1, env_flags={"GEMINI_API_KEY": True}, now=now)
        checked = verify_ruling_record(record)
        self.assertTrue(checked["ok"], checked)
        blob = json.dumps(record)
        self.assertNotIn("MOONSHOT_API_KEY", blob)
        self.assertNotIn("sk-", blob)
        gemini = next(row for row in record["voter_slots"] if row["id"] == "B")
        self.assertEqual(gemini["tier"], "free")
        self.assertEqual(gemini["status"], "voted")
        self.assertEqual(len(gemini["answer_sha256"]), 64)
        kimi = next(row for row in record["voter_slots"] if row["id"] == "D")
        self.assertEqual(kimi["tier"], "paid")
        self.assertEqual(kimi["status"], "disabled")
        self.assertIsNone(kimi["answer_sha256"])


if __name__ == "__main__":
    unittest.main()
