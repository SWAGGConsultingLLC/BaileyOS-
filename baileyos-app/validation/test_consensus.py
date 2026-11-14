"""Run:  python -m unittest validation.test_consensus   (from baileyos-app/)  -- stdlib only."""
import json, os, sys, unittest
from datetime import datetime, timedelta, timezone
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "api"))
from _validate_corridor import build_report, seal  # noqa: E402
from _consensus import convene, parse_reviewer_reply, sha256_hex  # noqa: E402
from _ruling import build_ruling_record, verify_ruling_record, make_linkage, delete_linkage_for_user, purge_linkage, daily_anchor, publish_anchor  # noqa: E402

with open(os.path.join(HERE, "sample_input.json"), encoding="utf-8") as fh:
    SAMPLE = json.load(fh)
NOW = datetime(2026, 11, 14, 12, 1, tzinfo=timezone.utc)
S = seal(SAMPLE, now=NOW)
CANON, H, INP = S["report_canonical_json"], S["report_sha256"], S["input_canonical_json"]
INPUT_SHA = S["input_sha256"]

def vote(verdict, reason="ok", h=H, inp=INPUT_SHA):
    return {"verdict": verdict, "reason": reason, "reviewed_report_sha256": h, "reviewed_input_sha256": inp}

def queen(canon=CANON, h=H, g=None, k=None, inp=INP, now=NOW):
    return convene(canon, h, g, k, now=now, input_canonical_json=inp)

def run(g=None, k=None, canon=CANON, h=H, inp=INP, now=NOW):
    return queen(canon, h, g, k, inp, now)["ruling"]

class QueenTests(unittest.TestCase):
    def test_both_pending_is_pending(self):            self.assertEqual(run(), "PENDING")
    def test_gemini_agree_kimi_pending_is_provisional(self):
        r = queen(g=vote("agree"))
        self.assertEqual(r["ruling"], "PROVISIONAL"); self.assertEqual(r["label"], "PROVISIONAL (2 of 3, awaiting Kimi)")
    def test_kimi_agree_gemini_pending_is_provisional(self):
        self.assertEqual(queen(k=vote("agree"))["label"], "PROVISIONAL (2 of 3, awaiting Gemini)")
    def test_all_agree_is_consensus(self):             self.assertEqual(run(vote("agree"), vote("agree")), "CONSENSUS")
    def test_any_disagree_is_dissent_with_who_and_why(self):
        r = queen(g=vote("agree"), k=vote("disagree", "node 3 looks wrong"))
        self.assertEqual(r["ruling"], "DISSENT"); self.assertEqual(r["dissent"], [{"reviewer": "kimi", "reason": "node 3 looks wrong"}])
    def test_dissent_beats_pending(self):              self.assertEqual(run(vote("disagree"), None), "DISSENT")
    def test_uncertain_is_never_consensus(self):
        self.assertEqual(run(vote("uncertain"), vote("agree")), "UNRESOLVED")
    def test_unavailable_gemini_is_unresolved_not_agree(self):
        self.assertEqual(run({"unavailable": True, "reason": "503"}, None), "UNRESOLVED")
    def test_stale_hash_vote_is_uncertain(self):
        r = queen(g=vote("agree", h="0" * 64), k=vote("agree"))
        self.assertEqual(r["ruling"], "UNRESOLVED")
    def test_tampered_report_gets_no_ruling(self):
        self.assertEqual(run(vote("agree"), vote("agree"), canon=CANON.replace("PASS", "FAIL", 1)), "NO_RULING")
    def test_missing_report_gets_no_ruling(self):      self.assertEqual(convene(None, None)["ruling"], "NO_RULING")
    def test_ruling_hash_is_self_consistent(self):
        r = queen(g=vote("agree")); body = {k: v for k, v in r.items() if k != "ruling_sha256"}
        self.assertEqual(r["ruling_sha256"], sha256_hex(json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)))
        self.assertEqual(r["report_sha256"], H)
    def test_parser_plain_fenced_and_chatty_json(self):
        self.assertEqual(parse_reviewer_reply('{"verdict":"agree","reason":"fine"}')["verdict"], "agree")
        self.assertEqual(parse_reviewer_reply('```json\n{"verdict":"Disagree","reason":"x"}\n```')["verdict"], "disagree")
        self.assertEqual(parse_reviewer_reply('Sure! {"verdict":"agree","reason":"y"} hope that helps')["verdict"], "agree")
    def test_parser_garbage_is_uncertain(self):
        for raw in ["", "I think it is fine", '{"verdict":"yes"}', "{not json}", None, 5, '{"verdict":["agree"]}']:
            self.assertEqual(parse_reviewer_reply(raw)["verdict"], "uncertain", raw)
    def test_raw_reply_path(self):
        g = {"raw_reply": '{"verdict":"agree","reason":"checks recompute"}', "reviewed_report_sha256": H}
        self.assertEqual(run(g, vote("agree")), "CONSENSUS")
    def test_consensus_on_failing_report_says_fail(self):
        bad = json.loads(json.dumps(SAMPLE)); bad["nodes"][0]["lat"] = 40.5
        s = seal(bad, now=NOW); r = queen(s["report_canonical_json"], s["report_sha256"],
              vote("agree", h=s["report_sha256"], inp=s["input_sha256"]),
              vote("agree", h=s["report_sha256"], inp=s["input_sha256"]), s["input_canonical_json"])
        self.assertEqual((r["ruling"], r["python_overall"]), ("CONSENSUS", "FAIL"))

    def test_seven_of_seven_then_stale_feed_is_never_consensus(self):
        self.assertEqual(S["report"]["summary"], {"total": 7, "passed": 7, "failed": 0, "warned": 0, "overall": "PASS"})
        later = NOW + timedelta(minutes=20)
        r = queen(g=vote("agree"), k=vote("agree"), now=later)
        self.assertNotEqual(r["ruling"], "CONSENSUS")
        self.assertEqual(r["ruling"], "PROVISIONAL")
        self.assertTrue(r["freshness_blocks_consensus"])

    def test_stale_feed_at_build_is_never_consensus(self):
        bad = json.loads(json.dumps(SAMPLE))
        bad["freshness"]["nws_alerts"]["fetched_at"] = "2026-11-14T10:00:00Z"
        s = seal(bad, now=NOW)
        self.assertEqual(s["report"]["summary"]["overall"], "FAIL")
        r = queen(s["report_canonical_json"], s["report_sha256"],
                  vote("agree", h=s["report_sha256"], inp=s["input_sha256"]),
                  vote("agree", h=s["report_sha256"], inp=s["input_sha256"]),
                  s["input_canonical_json"])
        self.assertNotEqual(r["ruling"], "CONSENSUS")
        self.assertEqual(r["ruling"], "PROVISIONAL")

    def test_dissent_still_wins_when_the_feed_is_stale(self):
        later = NOW + timedelta(minutes=20)
        r = queen(g=vote("disagree", "closure looks wrong"), k=vote("agree"), now=later)
        self.assertEqual(r["ruling"], "DISSENT")

    def test_input_hash_mismatch_is_uncertain(self):
        r = queen(g=vote("agree"), k=vote("agree"), inp=INP.replace("origin.bear", "origin.pear", 1))
        self.assertEqual(r["ruling"], "UNRESOLVED")
        self.assertTrue(all(v.get("hash_mismatch") is True for v in r["votes"]))
        self.assertTrue(all(v["verdict"] == "uncertain" for v in r["votes"]))

    def test_ruling_record_round_trip_and_chain(self):
        ruling = queen(g=vote("agree"), k=vote("agree"))
        first = build_ruling_record(S, ruling, now=NOW)
        checked = verify_ruling_record(first)
        self.assertTrue(checked["ok"], checked)
        second = build_ruling_record(S, ruling, prev_record_sha256=first["record_sha256"], now=NOW)
        self.assertEqual(second["prev_record_sha256"], first["record_sha256"])
        self.assertTrue(verify_ruling_record(second)["ok"])
        tampered = json.loads(json.dumps(first))
        tampered["queen"]["ruling"] = "DISSENT"
        self.assertFalse(verify_ruling_record(tampered)["ok"])
        self.assertIn("was not altered after sealing", first["note"])
        self.assertIn("does not show the decision was correct", first["note"])

    def test_deleting_linkage_does_not_break_the_chain(self):
        ruling = queen(g=vote("agree"), k=vote("agree"))
        first = build_ruling_record(S, ruling, now=NOW)
        second = build_ruling_record(S, ruling, prev_record_sha256=first["record_sha256"], now=NOW)
        before = (first["record_sha256"], second["record_sha256"], second["prev_record_sha256"])
        blob = json.dumps([first, second])
        for banned in ("user_id", "coarse_lat", "coarse_lon", '"area"', "user_lat", "accuracy"):
            self.assertNotIn(banned, blob)
        rows = [make_linkage("person-1", first["record_sha256"], 39.0639, -108.5506, "2026-11-14T12:01:00Z")]
        self.assertEqual(rows[0]["coarse_lat"], 39.06)
        self.assertEqual(delete_linkage_for_user(rows, "person-1"), [])
        self.assertEqual((first["record_sha256"], second["record_sha256"], second["prev_record_sha256"]), before)
        old = [make_linkage("person-1", first["record_sha256"], 39.06, -108.55, "2026-10-01T00:00:00Z")]
        self.assertEqual(purge_linkage(old, NOW), [])
        self.assertEqual(second["prev_record_sha256"], first["record_sha256"])

    def test_anchor_is_not_published(self):
        anchor = daily_anchor("2026-11-14", S["report_sha256"], 1)
        self.assertEqual(len(anchor["daily_sha256"]), 64)
        posted = publish_anchor(anchor)
        self.assertFalse(posted["published"])
        self.assertTrue(posted["needs_owner_approval"])
        self.assertEqual(anchor["daily_sha256"], posted["daily_sha256"])

if __name__ == "__main__":
    unittest.main()
