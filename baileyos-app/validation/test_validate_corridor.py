"""Run:  python -m unittest validation.test_validate_corridor   (from baileyos-app/)  -- stdlib only."""
import copy, json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "api"))
from _validate_corridor import build_report, seal, canonical_json, sha256_hex, haversine_km  # noqa: E402

with open(os.path.join(HERE, "sample_input.json"), encoding="utf-8") as fh:
    SAMPLE = json.load(fh)

def status(report, cid):
    return next(c for c in report["checks"] if c["id"] == cid)["status"]

class ValidatorTests(unittest.TestCase):
    def test_sample_passes_everything(self):
        r = build_report(SAMPLE)
        self.assertEqual(r["summary"], {"total": 6, "passed": 6, "failed": 0, "overall": "PASS"})

    def test_deterministic_apart_from_timestamp(self):
        a, b = build_report(SAMPLE), build_report(SAMPLE)
        a.pop("generated_at"); b.pop("generated_at")
        self.assertEqual(canonical_json(a), canonical_json(b))

    def test_hashes_match_canonical_string(self):
        s = seal(build_report(SAMPLE))
        self.assertEqual(s["report_sha256"], sha256_hex(s["report_canonical_json"]))
        self.assertEqual(json.loads(s["report_canonical_json"]), s["report"])

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

if __name__ == "__main__":
    unittest.main()
