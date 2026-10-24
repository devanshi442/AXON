"""
fetch_horizons_fixtures.py — Fetch JPL Horizons topocentric Az/El of Sun and Earth
for a lunar surface site (golden-test fixtures).

Usage (single site):
    python pipeline/fetch_horizons_fixtures.py <name> <lat_deg> <east_lon_deg> <start> <stop>

    Example (IM-1):
        python pipeline/fetch_horizons_fixtures.py im-1 -80.13 1.44 2024-02-22 2024-03-22

Batch run (all new fixtures — does NOT overwrite existing files):
    python pipeline/fetch_horizons_fixtures.py --batch

Horizons params:
    CENTER      = 'coord@301'  (Moon surface)
    COORD_TYPE  = 'GEODETIC'
    SITE_COORD  = '<east_lon>,<lat>,0'    (E-lon first, then lat; alt=0 km)
    QUANTITIES  = '4'          (Az/El)
    STEP_SIZE   = '60 min'
    APPARENT    = 'AIRLESS'

Reference: https://ssd-api.jpl.nasa.gov/doc/horizons.html
"""

import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

OUT = pathlib.Path("science/fixtures/horizons")
OUT.mkdir(parents=True, exist_ok=True)

# New fixtures to add (do NOT include existing im-1 or blue-ghost-1 ranges).
# SITE_COORD format: east_lon, lat
# Apollo 11 date is within de440s coverage (1849-2150). de441 would cover it but
# we use de440s which starts 1849-12-25 — 1969-07-20 IS within coverage.
NEW_FIXTURES = [
    {
        "name": "im-2",
        "lat": -84.7906,
        "east_lon": 29.1957,
        "start": "2025-03-02",
        "stop": "2025-03-30",
        "note": "IM-2 at published landing coordinates (Wikipedia; LROC intended -84.78,29.13)",
    },
    {
        "name": "farside-0N-180E",
        "lat": 0.0,
        "east_lon": 180.0,
        "start": "2025-03-02",
        "stop": "2025-03-30",
        "note": "Far-side control site: Earth should never be above horizon",
    },
    {
        "name": "nearlimb-0N-90E",
        "lat": 0.0,
        "east_lon": 90.0,
        "start": "2025-03-02",
        "stop": "2025-03-30",
        "note": "Near-limb control site: Earth near horizon",
    },
    {
        "name": "apollo11",
        "lat": 0.6875,
        "east_lon": 23.4333,
        "start": "1969-07-19",
        "stop": "1969-07-21",
        "note": "Apollo 11 landing site — inside de440s coverage (1849-2150)",
    },
]

# Shackleton-Malapert placeholder — coordinates sourced from Tier 2-D research.
# Using Shackleton rim candidate coordinates from Colaprete et al. 2012 / NASA LDEP:
# Shackleton rim: approximately -89.67 S, 0.0 E (closest published point on rim)
# NOTE: This will be updated once Tier 2-D sourcing is complete.
SHACKLETON_FIXTURE = {
    "name": "shackleton-rim",
    "lat": -89.67,
    "east_lon": 0.0,
    "start": "2025-03-02",
    "stop": "2025-03-30",
    "note": "Shackleton rim candidate (approx -89.67S,0E); placeholder — update after Tier 2-D",
}


def build_query(east_lon: float, lat: float, cmd: str, start: str, stop: str) -> dict:
    return {
        "format": "json",
        "COMMAND": f"'{cmd}'",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{east_lon},{lat},0'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": "'60 min'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'",
        "CSV_FORMAT": "'YES'",
    }


def fetch_fixture(name: str, lat: float, east_lon: float, start: str, stop: str,
                  note: str = "") -> dict[str, str]:
    """Fetch Sun and Earth fixtures for one site.  Returns {body: status}."""
    results = {}
    for body, cmd in (("sun", "10"), ("earth", "399")):
        out_file = OUT / f"{name}_{body}_{start}_{stop}.json"
        query_file = OUT / f"{name}_{body}_{start}_{stop}_query.json"

        if out_file.exists():
            print(f"  SKIP (exists): {out_file.name}")
            results[body] = "skipped"
            continue

        q = build_query(east_lon, lat, cmd, start, stop)
        url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
        print(f"  GET  [{name}/{body}]  {url[:100]}...")

        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AXON-LunarSight/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
        except urllib.error.HTTPError as exc:
            print(f"  ERROR: HTTP {exc.code}")
            results[body] = f"failed: HTTP {exc.code}"
            continue
        except Exception as exc:
            print(f"  ERROR: {exc}")
            results[body] = f"failed: {exc}"
            continue

        # Check for Horizons-level error
        if "error" in data:
            print(f"  HORIZONS ERROR: {data['error']}")
            results[body] = f"failed: {data['error']}"
            continue

        # Count data rows
        raw = data.get("result", "")
        row_count = raw.count("\\n") if isinstance(raw, str) else 0

        out_file.write_text(json.dumps(data, indent=1), encoding="utf-8")
        # Save query metadata
        meta = {
            "name": name, "body": body, "lat": lat, "east_lon": east_lon,
            "start": start, "stop": stop, "note": note,
            "url": url, "params": q, "approx_row_count": row_count,
        }
        query_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        print(f"  OK   {out_file.name}  (~{row_count} data lines)")
        results[body] = "downloaded"
        time.sleep(1)   # be polite to Horizons API

    return results


def main_batch():
    all_fixtures = NEW_FIXTURES + [SHACKLETON_FIXTURE]
    summary = {}
    for f in all_fixtures:
        print(f"\n--- {f['name']} ({f['lat']}, E{f['east_lon']}) ---")
        r = fetch_fixture(f["name"], f["lat"], f["east_lon"], f["start"], f["stop"], f.get("note", ""))
        summary[f["name"]] = r

    print("\n" + "="*60)
    print("HORIZONS FIXTURE SUMMARY")
    print("="*60)
    for name, r in summary.items():
        for body, status in r.items():
            print(f"  {name:30s}  {body:6s}  {status}")


def main_single():
    if len(sys.argv) < 6:
        print(__doc__)
        sys.exit(1)
    name = sys.argv[1]
    lat = float(sys.argv[2])
    east_lon = float(sys.argv[3])
    start = sys.argv[4]
    stop = sys.argv[5]
    fetch_fixture(name, lat, east_lon, start, stop)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--batch":
        main_batch()
    else:
        main_single()
