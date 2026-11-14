"""Run:  python -m unittest validation.test_validate_corridor   (from baileyos-app/)  -- stdlib only."""
import copy, json, os, sys, unittest
from datetime import datetime, timezone
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "api"))
from _validate_corridor import build_report, seal, canonical_json, sha256_hex, haversine_km, CANONICALIZATION  # noqa: E402

with open(os.path.join(HERE, "sample_input.json"), encoding="utf-8") as fh:
    SAMPLE = json.load(fh)
NOW = datetime(2026, 11, 14, 12, 1, tzinfo=timezone.utc)

def status(report, cid):
    return next(c for c in report["checks"] if c["id"] == cid)["status"]

class ValidatorTests(unittest.TestCase):
    def test_sample_passes_everything(self):
        r = build_report(SAMPLE, now=NOW)
        self.assertEqual(r["summary"], {"total": 8, "passed": 8, "failed": 0, "warned": 0, "overall": "PASS"})

    def test_deterministic_apart_from_timestamp(self):
        a, b = build_report(SAMPLE, now=NOW), build_report(SAMPLE, now=NOW)
        a.pop("generated_at"); b.pop("generated_at")
        self.assertEqual(canonical_json(a), canonical_json(b))

    def test_hashes_match_canonical_string(self):
        s = seal(SAMPLE, now=NOW)
        self.assertEqual(s["report_sha256"], sha256_hex(s["report_canonical_json"]))
        self.assertEqual(s["input_sha256"], sha256_hex(s["input_canonical_json"]))
        self.assertEqual(s["report"]["input_sha256"], s["input_sha256"])
        self.assertFalse(s["report_canonical_json"].endswith("\n"))
        self.assertFalse(s["input_canonical_json"].endswith("\n"))
        self.assertEqual(json.loads(s["report_canonical_json"]), s["report"])
        rule = s["kimi_package"]["canonicalization"]["rule"]
        self.assertIn("sorted keys", rule)
        self.assertIn("UTF-8", rule)
        self.assertIn("no trailing newline", rule)
        self.assertEqual(s["kimi_package"]["canonicalization"], CANONICALIZATION)
        self.assertIn("input_sha256_bytes", s["kimi_package"]["canonicalization"])
        self.assertIn("report_sha256_bytes", s["kimi_package"]["canonicalization"])

    def test_input_hash_changes_with_input(self):
        other = copy.deepcopy(SAMPLE); other["nodes"][0]["lat"] += 0.001
        self.assertNotEqual(build_report(SAMPLE)["input_sha256"], build_report(other)["input_sha256"])

    def test_keypoint_outside_bbox_fails(self):
        bad = copy.deepcopy(SAMPLE)
        bad["corridor"]["features"][0]["geometry"]["coordinates"][3] = [-90.0, 39.0]
        self.assertEqual(status(build_report(bad), "C3"), "FAIL")

    def test_wrong_keypoint_count_fails(self):
        bad = copy.deepcopy(SAMPLE)
        bad["corridor"]["features"][0]["geometry"]["coordinates"].pop()
        self.assertEqual(status(build_report(bad), "C2"), "FAIL")

    def test_far_node_fails(self):
        bad = copy.deepcopy(SAMPLE); bad["nodes"][0]["lat"] = 40.5
        self.assertEqual(status(build_report(bad), "C6"), "FAIL")

    def test_not_geojson_fails_without_crashing(self):
        r = build_report({"corridor": {"type": "Nope"}, "nodes": []})
        self.assertEqual(r["summary"]["overall"], "FAIL")

    def test_nan_and_strings_do_not_crash(self):
        bad = copy.deepcopy(SAMPLE)
        bad["corridor"]["features"][0]["geometry"]["coordinates"][1] = ["x", None]
        bad["nodes"][1]["lat"] = "39"
        self.assertEqual(build_report(bad)["summary"]["overall"], "FAIL")

    def test_haversine_known_distance(self):  # Denver -> Grand Junction is about 340 km as the crow flies
        d = haversine_km(-104.99, 39.74, -108.55, 39.06)
        self.assertTrue(300 < d < 380, d)

    def test_freshness_limits_are_per_layer_and_in_the_report(self):
        r = build_report(SAMPLE, now=NOW)
        limits = r["freshness"]["limits"]
        self.assertGreater(limits["usgs"]["max_age_seconds"], 3600)
        self.assertLessEqual(limits["nws_alerts"]["max_age_seconds"], 900)
        self.assertLessEqual(limits["cdot"]["max_age_seconds"], 900)
        self.assertLessEqual(limits["amber"]["max_age_seconds"], 900)
        self.assertGreaterEqual(limits["crime"]["max_age_seconds"], 86400)
        self.assertEqual(len(limits), 8)
        self.assertFalse(r["freshness"]["blocks_consensus"])

    def test_stale_feed_fails_and_is_not_pass(self):
        bad = copy.deepcopy(SAMPLE)
        bad["freshness"]["cdot"]["fetched_at"] = "2026-11-14T10:00:00Z"
        r = build_report(bad, now=NOW)
        self.assertEqual(status(r, "C7"), "FAIL")
        self.assertNotEqual(r["summary"]["overall"], "PASS")
        self.assertTrue(r["freshness"]["blocks_consensus"])

    def test_empty_feed_warns_and_is_not_pass(self):
        bad = copy.deepcopy(SAMPLE)
        bad["freshness"]["amber"]["record_count"] = 0
        r = build_report(bad, now=NOW)
        self.assertEqual(status(r, "C7"), "WARN")
        self.assertEqual(r["summary"]["overall"], "WARN")
        self.assertNotEqual(r["summary"]["overall"], "PASS")

    def test_quake_magnitude_outside_range_fails_sanity(self):
        bad = copy.deepcopy(SAMPLE)
        bad["freshness"]["usgs"]["items"] = [{"mag": 12, "lat": 39.06, "lon": -108.55, "time": "2026-11-14T11:40:00Z"}]
        bad["freshness"]["usgs"]["record_count"] = 1
        r = build_report(bad, now=NOW)
        self.assertEqual(status(r, "C8"), "FAIL")
        self.assertNotEqual(r["summary"]["overall"], "PASS")
        self.assertTrue(next(c for c in r["checks"] if c["id"] == "C8")["value"]["blocks_consensus"])

if __name__ == "__main__":
    unittest.main()
