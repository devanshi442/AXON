"""Validate data/missions.yaml and compile it to web/public/data/missions.json and web_public_data/missions.json.
Usage: python pipeline/validate_missions.py
Fails (exit 1) on schema errors; prints warnings for items needing human work."""
import datetime
import json
import pathlib
import sys
import yaml
from jsonschema import Draft202012Validator

root = pathlib.Path(__file__).resolve().parent.parent
raw_data = yaml.safe_load((root / "data/missions.yaml").read_text(encoding="utf-8"))
# Convert datetime.date and custom yaml types to standard JSON types before validation
data = json.loads(json.dumps(raw_data, default=str))
schema = json.loads((root / "data/schema/missions.schema.json").read_text(encoding="utf-8"))

validator = Draft202012Validator(schema)
errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
for e in errors:
    print("SCHEMA ERROR:", "/".join(map(str, e.path)), "-", e.message)

# Check unique IDs across missions, reference sites, candidate sites
mission_ids = [m["id"] for m in data.get("missions", [])]
ref_ids = [r["id"] for r in data.get("reference_sites", [])]
cand_ids = [c["id"] for c in data.get("candidate_sites", [])]
all_ids = mission_ids + ref_ids + cand_ids

dupes = {i for i in all_ids if all_ids.count(i) > 1}
if dupes:
    errors.append(f"duplicate ids {dupes}")
    print("ERROR duplicate ids:", dupes)

warn = 0
for m in data.get("missions", []):
    s = m.get("site", {})
    if s.get("lat") is None or s.get("lon") is None:
        print(f"WARN mission {m['id']}: no coordinates (site geometry cannot be computed yet)")
        warn += 1
    if not m.get("verified", False):
        warn += 1
    if m.get("status") == "unknown_needs_check":
        print(f"WARN mission {m['id']}: status needs research")
        warn += 1

for c in data.get("candidate_sites", []):
    if not c.get("verified", False):
        warn += 1

if errors:
    sys.exit(1)

payload = {
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    **data,
}
json_text = json.dumps(payload, indent=2, default=str)

# Legacy output (keep for backward compat)
out_legacy = root / "web_public_data"
out_legacy.mkdir(exist_ok=True)
(out_legacy / "missions.json").write_text(json_text, encoding="utf-8")

# Primary output — where the React app expects it
out_web = root / "web" / "public" / "data"
out_web.mkdir(parents=True, exist_ok=True)
(out_web / "missions.json").write_text(json_text, encoding="utf-8")

print(f"OK: {len(mission_ids)} missions, {len(ref_ids)} reference sites, {len(cand_ids)} candidate sites compiled ({warn} warnings)")
print(f"  -> {out_legacy / 'missions.json'}")
print(f"  -> {out_web / 'missions.json'}")
