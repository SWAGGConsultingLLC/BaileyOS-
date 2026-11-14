"""Run:  python -m unittest validation.test_consensus   (from baileyos-app/)  -- stdlib only."""
import copy, json, os, sys, threading, unittest
from datetime import datetime, timedelta, timezone
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "api"))
from _validate_corridor import build_report, seal  # noqa: E402
from _consensus import convene, parse_reviewer_reply, sha256_hex  # noqa: E402
from _ruling import (  # noqa: E402
    ChainConflict, append_with_retry, build_genesis_record, build_ruling_record, continuity_lights,
    feed_fingerprint, pairwise_agreement, verify_chain, verify_ruling_record, make_linkage,
    delete_linkage_for_user, purge_linkage, daily_anchor, publish_anchor, canonical_json as ruling_canonical,
)
from _roadmap import publish_git_anchor, trip_handshake_interface  # noqa: E402

with open(os.path.join(HERE, "sample_input.json"), encoding="utf-8") as fh:
    SAMPLE = json.load(fh)
NOW = datetime(2026, 11, 14, 12, 1, tzinfo=timezone.utc)
S = seal(SAMPLE, now=NOW)
CANON, H, INP = S["report_canonical_json"], S["report_sha256"], S["input_canonical_json"]
INPUT_SHA = S["input_sha256"]

def vote(verdict, reason="ok", h=H, inp=INPUT_SHA):
    return {"verdict": verdict, "reason": reason, "reviewed_report_sha256": h, "reviewed_input_sha256": inp}

def queen(canon=CANON, h=H, g=None, k=None, inp=INP, now=NOW, payloads=None):
    return convene(canon, h, g, k, now=now, input_canonical_json=inp, payloads=payloads)

def run(g=None, k=None, canon=CANON, h=H, inp=INP, now=NOW):
    return queen(canon, h, g, k, inp, now)["ruling"]

class QueenTests(unittest.TestCase):
    def test_both_pending_is_pending(self):            self.assertEqual(run(), "PENDING")
    def test_gemini_agree_kimi_pending_is_consensus_and_names_kimi(self):
        r = queen(g=vote("agree"))
        self.assertEqual(r["ruling"], "CONSENSUS")
        self.assertEqual(r["missing_voters"], ["kimi"])
        self.assertIn("missing: Kimi", r["label"])
    def test_kimi_agree_gemini_pending_names_gemini(self):
        r = queen(k=vote("agree"))
        self.assertEqual(r["ruling"], "CONSENSUS")
        self.assertEqual(r["missing_voters"], ["gemini"])
        self.assertIn("missing: Gemini", r["label"])
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
        self.assertEqual(S["report"]["summary"], {"total": 8, "passed": 8, "failed": 0, "warned": 0, "overall": "PASS"})
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
        first = build_ruling_record(S, ruling, sequence_number=1, now=NOW)
        checked = verify_ruling_record(first)
        self.assertTrue(checked["ok"], checked)
        self.assertEqual(first["schema_version"], "1.1")
        second = build_ruling_record(S, ruling, prev_record_sha256=first["record_sha256"], sequence_number=2, now=NOW)
        self.assertEqual(second["prev_record_sha256"], first["record_sha256"])
        self.assertTrue(verify_ruling_record(second)["ok"])
        tampered = json.loads(json.dumps(first))
        tampered["queen"]["ruling"] = "DISSENT"
        self.assertFalse(verify_ruling_record(tampered)["ok"])
        self.assertIn("was not altered after sealing", first["note"])
        self.assertIn("does not show the decision was correct", first["note"])

    def test_deleting_linkage_does_not_break_the_chain(self):
        ruling = queen(g=vote("agree"), k=vote("agree"))
        first = build_ruling_record(S, ruling, sequence_number=1, now=NOW)
        second = build_ruling_record(S, ruling, prev_record_sha256=first["record_sha256"], sequence_number=2, now=NOW)
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

    def test_concurrent_append_cannot_fork(self):
        ruling = queen(g=vote("agree"), k=vote("agree"))
        log = {"rows": [], "lock": threading.Lock()}

        def head():
            with log["lock"]:
                if not log["rows"]:
                    return None, 0
                last = log["rows"][-1]
                return last["record_sha256"], last["sequence_number"]

        def write(record):
            with log["lock"]:
                prev = log["rows"][-1]["record_sha256"] if log["rows"] else None
                seq = log["rows"][-1]["sequence_number"] + 1 if log["rows"] else 1
                if record.get("prev_record_sha256") != prev or record.get("sequence_number") != seq:
                    raise ChainConflict("chain head moved")
                log["rows"].append(record)

        def build(prev, seq):
            if prev is None:
                return build_genesis_record(now=NOW)
            return build_ruling_record(S, ruling, prev_record_sha256=prev, sequence_number=seq, now=NOW)

        def worker():
            append_with_retry(head, write, build)

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        checked = verify_chain(log["rows"])
        self.assertTrue(checked["ok"], checked)
        self.assertFalse(checked["fork"])
        self.assertEqual(log["rows"][0]["queen"]["ruling"], "GENESIS")
        prevs = [row.get("prev_record_sha256") for row in log["rows"] if row.get("prev_record_sha256")]
        self.assertEqual(len(prevs), len(set(prevs)))
        self.assertEqual(len(log["rows"]), 8)

    def test_retry_rereads_the_head_after_a_conflict(self):
        genesis = build_genesis_record(now=NOW)
        ruling = queen(g=vote("agree"), k=vote("agree"))
        calls = {"n": 0}

        def head():
            if calls["n"] == 0:
                return None, 0
            return genesis["record_sha256"], 1

        def write(record):
            calls["n"] += 1
            if calls["n"] == 1:
                raise ChainConflict("chain head moved")
            self.assertEqual(record["prev_record_sha256"], genesis["record_sha256"])
            self.assertEqual(record["sequence_number"], 2)

        def build(prev, seq):
            if prev is None:
                return build_genesis_record(now=NOW)
            return build_ruling_record(S, ruling, prev_record_sha256=prev, sequence_number=seq, now=NOW)

        got = append_with_retry(head, write, build)
        self.assertEqual(got["sequence_number"], 2)
        self.assertEqual(calls["n"], 2)

    def test_verify_detects_a_fork(self):
        ruling = queen(g=vote("agree"), k=vote("agree"))
        genesis = build_genesis_record(now=NOW)
        left = build_ruling_record(S, ruling, prev_record_sha256=genesis["record_sha256"], sequence_number=2, now=NOW)
        right = build_ruling_record(S, ruling, prev_record_sha256=genesis["record_sha256"], sequence_number=3, now=NOW)
        self.assertTrue(verify_ruling_record(left)["ok"])
        self.assertTrue(verify_ruling_record(right)["ok"])
        checked = verify_chain([genesis, left, right])
        self.assertTrue(checked["fork"])
        self.assertFalse(checked["ok"])
        self.assertTrue(any("same prev" in item for item in checked["problems"]))

    def test_sanity_failure_blocks_consensus(self):
        bad = copy.deepcopy(SAMPLE)
        bad["freshness"]["usgs"]["items"] = [{"mag": 12, "lat": 39.06, "lon": -108.55, "time": "2026-11-14T11:40:00Z"}]
        bad["freshness"]["usgs"]["record_count"] = 1
        sealed = seal(bad, now=NOW)
        r = queen(sealed["report_canonical_json"], sealed["report_sha256"],
                  vote("agree", h=sealed["report_sha256"], inp=sealed["input_sha256"]),
                  vote("agree", h=sealed["report_sha256"], inp=sealed["input_sha256"]),
                  sealed["input_canonical_json"])
        self.assertNotEqual(r["ruling"], "CONSENSUS")
        self.assertEqual(r["ruling"], "PROVISIONAL")
        self.assertTrue(r["sanity_blocks_consensus"])

    def test_fingerprint_must_recompute(self):
        items = [{"agency": "USGS", "expires_at": None, "id": "q", "issued_at": None, "kind": "quake", "title": "M 2.1"}]
        bad = copy.deepcopy(SAMPLE)
        bad["freshness"]["usgs"]["payload_sha256"] = feed_fingerprint(items)
        sealed = seal(bad, now=NOW)
        agreed = (
            vote("agree", h=sealed["report_sha256"], inp=sealed["input_sha256"]),
            vote("agree", h=sealed["report_sha256"], inp=sealed["input_sha256"]),
        )
        fresh = queen(sealed["report_canonical_json"], sealed["report_sha256"], agreed[0], agreed[1], sealed["input_canonical_json"], payloads={"usgs": items})
        self.assertEqual(fresh["ruling"], "CONSENSUS")
        self.assertFalse(fresh["fingerprint_blocks_consensus"])
        stale = queen(sealed["report_canonical_json"], sealed["report_sha256"], agreed[0], agreed[1], sealed["input_canonical_json"], payloads={"usgs": []})
        self.assertTrue(stale["fingerprint_blocks_consensus"])
        self.assertEqual(stale["ruling"], "PROVISIONAL")

    def test_pairwise_rates_are_not_used_for_quorum(self):
        ruling = queen(g=vote("agree"), k=vote("disagree", "not the same"))
        record = build_ruling_record(S, ruling, sequence_number=2, prev_record_sha256=build_genesis_record(now=NOW)["record_sha256"], now=NOW)
        rates = pairwise_agreement([record], now=NOW)
        self.assertFalse(rates["used_for_quorum"])
        pair = next(item for item in rates["pairs"] if item["a"] == "gemini" and item["b"] == "kimi")
        self.assertEqual(pair["compared"], 1)
        self.assertEqual(pair["rate"], 0.0)
        self.assertEqual(ruling["ruling"], "DISSENT")

    def test_v10_record_still_verifies(self):
        verdict = {"reason": "ok", "reviewer": "python", "verdict": "agree"}
        verdict["verdict_sha256"] = sha256_hex(ruling_canonical({k: v for k, v in verdict.items() if k != "verdict_sha256"}))
        queen_view = {
            "convened_at": "2026-11-14T12:01:00Z",
            "label": "CONSENSUS",
            "python_overall": "PASS",
            "ruling": "CONSENSUS",
            "seats": {"agreeing": 3, "total": 3},
            "source_ruling_sha256": sha256_hex("queen"),
        }
        record = {
            "schema_version": "1.0",
            "kind": "baileyos.ruling_record",
            "created_at": "2026-11-14T12:01:00Z",
            "prev_record_sha256": None,
            "input_sha256": sha256_hex("input"),
            "report_sha256": sha256_hex("report"),
            "feed_sha256": {},
            "verdicts": [verdict],
            "freshness": {"limits": {}, "sources": []},
            "queen": queen_view,
            "queen_sha256": sha256_hex(ruling_canonical(queen_view)),
            "note": "This is a tamper-evident decision record.",
        }
        record["record_sha256"] = sha256_hex(ruling_canonical(record))
        checked = verify_ruling_record(record)
        self.assertTrue(checked["ok"], checked)
        record["queen"] = dict(queen_view)
        record["queen"]["ruling"] = "DISSENT"
        self.assertFalse(verify_ruling_record(record)["ok"])

    def test_lights_pending_without_a_log_and_lock_waits_for_an_anchor(self):
        empty = continuity_lights([], configured=False, now=NOW)
        self.assertEqual(empty["continuity_lock"], "PENDING")
        self.assertEqual(empty["consensus"]["state"], "PENDING")
        self.assertNotIn("LOCKED", empty["lock_line"])
        ruling = queen(g=vote("agree"), k=vote("agree"))
        genesis = build_genesis_record(now=NOW)
        record = build_ruling_record(S, ruling, prev_record_sha256=genesis["record_sha256"], sequence_number=2, now=NOW)
        lights = continuity_lights([genesis, record], configured=True, anchored_today=False, now=NOW)
        self.assertEqual(lights["consensus"]["line"], "1 of 1 CONSENSUS over 30 days.")
        self.assertEqual(lights["consensus"]["state"], "GREEN")
        self.assertEqual(lights["feed_health"]["state"], "GREEN")
        self.assertEqual(lights["chain_integrity"]["state"], "GREEN")
        self.assertEqual(lights["continuity_lock"], "PENDING")
        self.assertIn("anchor not published", lights["lock_line"])
        self.assertFalse(lights["pairwise"]["used_for_quorum"])
        locked = continuity_lights([genesis, record], configured=True, anchored_today=True, now=NOW)
        self.assertEqual(locked["continuity_lock"], "LOCKED")
        forked = continuity_lights([genesis, record, build_ruling_record(S, ruling, prev_record_sha256=genesis["record_sha256"], sequence_number=3, now=NOW)], configured=True, now=NOW)
        self.assertEqual(forked["chain_integrity"]["state"], "RED")
        self.assertNotEqual(forked["continuity_lock"], "LOCKED")
        tampered = json.loads(json.dumps(record))
        tampered["record_sha256"] = "0" * 64
        broken = continuity_lights([genesis, tampered], configured=True, now=NOW)
        self.assertEqual(broken["chain_integrity"]["state"], "RED")
        self.assertEqual(broken["consensus"]["state"], "PENDING")
        self.assertNotEqual(broken["feed_health"]["state"], "GREEN")

    def test_later_steps_are_interfaces_only(self):
        anchor = daily_anchor("2026-11-14", S["report_sha256"], 1)
        posted = publish_git_anchor(anchor, {"owner_approved": True, "day": "2026-11-14"})
        self.assertFalse(posted["implemented"])
        self.assertFalse(posted["published"])
        self.assertFalse(posted["auto_post"])
        self.assertTrue(posted["approval_present"])
        refused = publish_git_anchor(anchor, None)
        self.assertFalse(refused["approval_present"])
        trip = trip_handshake_interface()
        self.assertFalse(trip["implemented"])
        self.assertFalse(trip["live"])
        self.assertEqual(trip["trip_genesis"], "G = H(canonical{pub_A, pub_B, nonce})")
        self.assertIn("X25519", trip["key_agreement"])

if __name__ == "__main__":
    unittest.main()
