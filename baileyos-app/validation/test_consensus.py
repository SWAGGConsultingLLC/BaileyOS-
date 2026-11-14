"""Run:  python -m unittest validation.test_consensus   (from baileyos-app/)  -- stdlib only."""
import json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "api"))
from _validate_corridor import build_report, seal  # noqa: E402
from _consensus import convene, parse_reviewer_reply, sha256_hex  # noqa: E402

with open(os.path.join(HERE, "sample_input.json"), encoding="utf-8") as fh:
    SAMPLE = json.load(fh)
S = seal(build_report(SAMPLE))
CANON, H = S["report_canonical_json"], S["report_sha256"]

def vote(verdict, reason="ok", h=H):
    return {"verdict": verdict, "reason": reason, "reviewed_report_sha256": h}

def run(g=None, k=None, canon=CANON, h=H):
    return convene(canon, h, g, k)["ruling"]

class QueenTests(unittest.TestCase):
    def test_both_pending_is_pending(self):            self.assertEqual(run(), "PENDING")
    def test_gemini_agree_kimi_pending_is_provisional(self):
        r = convene(CANON, H, vote("agree"), None)
        self.assertEqual(r["ruling"], "PROVISIONAL"); self.assertEqual(r["label"], "PROVISIONAL (2 of 3, awaiting Kimi)")
    def test_kimi_agree_gemini_pending_is_provisional(self):
        self.assertEqual(convene(CANON, H, None, vote("agree"))["label"], "PROVISIONAL (2 of 3, awaiting Gemini)")
    def test_all_agree_is_consensus(self):             self.assertEqual(run(vote("agree"), vote("agree")), "CONSENSUS")
    def test_any_disagree_is_dissent_with_who_and_why(self):
        r = convene(CANON, H, vote("agree"), vote("disagree", "node 3 looks wrong"))
        self.assertEqual(r["ruling"], "DISSENT"); self.assertEqual(r["dissent"], [{"reviewer": "kimi", "reason": "node 3 looks wrong"}])
    def test_dissent_beats_pending(self):              self.assertEqual(run(vote("disagree"), None), "DISSENT")
    def test_uncertain_is_never_consensus(self):
        self.assertEqual(run(vote("uncertain"), vote("agree")), "UNRESOLVED")
    def test_unavailable_gemini_is_unresolved_not_agree(self):
        self.assertEqual(run({"unavailable": True, "reason": "503"}, None), "UNRESOLVED")
    def test_stale_hash_vote_is_uncertain(self):
        r = convene(CANON, H, vote("agree", h="0" * 64), vote("agree"))
        self.assertEqual(r["ruling"], "UNRESOLVED")
    def test_tampered_report_gets_no_ruling(self):
        self.assertEqual(run(vote("agree"), vote("agree"), canon=CANON.replace("PASS", "FAIL", 1)), "NO_RULING")
    def test_missing_report_gets_no_ruling(self):      self.assertEqual(convene(None, None)["ruling"], "NO_RULING")
    def test_ruling_hash_is_self_consistent(self):
        r = convene(CANON, H, vote("agree"), None); body = {k: v for k, v in r.items() if k != "ruling_sha256"}
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
        s = seal(build_report(bad)); r = convene(s["report_canonical_json"], s["report_sha256"],
              vote("agree", h=s["report_sha256"]), vote("agree", h=s["report_sha256"]))
        self.assertEqual((r["ruling"], r["python_overall"]), ("CONSENSUS", "FAIL"))

if __name__ == "__main__":
    unittest.main()
