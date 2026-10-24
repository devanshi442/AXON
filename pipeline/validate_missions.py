"""Validate data/missions.yaml and compile it to web_public_data/missions.json.
Usage: python pipeline/validate_missions.py
Fails (exit 1) on schema errors; prints warnings for items needing human work."""
import json, sys, pathlib, datetime
import yaml
from jsonschema import Draft202012Validator

root = pathlib.Path(__file__).resolve().parent.parent
data = yaml.safe_load((root / "data/missions.yaml").read_text(encoding="utf-8"))
schema = json.loads((root / "data/schema/missions.schema.json").read_text(encoding="utf-8"))

errors = sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: list(e.path))
for e in errors:
    print("SCHEMA ERROR:", "/".join(map(str, e.path)), "-", e.message)

ids = [m["id"] for m in data["missions"]]
dupes = {i for i in ids if ids.count(i) > 1}
if dupes:
    errors.append(f"duplicate ids {dupes}"); print("ERROR duplicate ids:", dupes)

warn = 0
for m in data["missions"]:
    s = m["site"]
    if s["lat"] is None or s["lon"] is None:
        print(f"WARN {m['id']}: no coordinates (site geometry cannot be computed yet)"); warn += 1
    if not m["verified"]:
        print(f"WARN {m['id']}: not verified by a second reviewer"); warn += 1
    if m["status"] == "unknown_needs_check":
        print(f"WARN {m['id']}: status needs research"); warn += 1

if errors:
    sys.exit(1)

payload = {"generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), **data}
json_text = json.dumps(payload, indent=2, default=str)

# Legacy output (keep for backward compat)
out_legacy = root / "web_public_data"
out_legacy.mkdir(exist_ok=True)
(out_legacy / "missions.json").write_text(json_text, encoding="utf-8")

# Primary output — where the React app expects it
out_web = root / "web" / "public" / "data"
out_web.mkdir(parents=True, exist_ok=True)
(out_web / "missions.json").write_text(json_text, encoding="utf-8")

print(f"OK: {len(ids)} missions compiled, {warn} warnings")
print(f"  -> {out_legacy / 'missions.json'}")
print(f"  -> {out_web / 'missions.json'}")
