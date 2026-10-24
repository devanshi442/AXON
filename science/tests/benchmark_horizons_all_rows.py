"""
benchmark_horizons_all_rows.py — Evaluates every single row of every Horizons fixture
against SPICE topocentric coordinates and reports max and mean elevation and azimuth differences.
"""

import json
import math
import pathlib
from lunarsight_core import constants as C
from lunarsight_core import geometry as G

def diff_angle(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)

def parse_fixture_rows(json_path):
    d = json.loads(json_path.read_text(encoding="utf-8"))
    res = d["result"]
    soe = res.find("$$SOE")
    eoe = res.find("$$EOE")
    segment = res[soe + 5:eoe].strip()
    rows = []
    for line in segment.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        # parts[0]: time, parts[3]: az, parts[4]: el
        t_str = parts[0]
        az = float(parts[3])
        el = float(parts[4])
        rows.append((t_str, az, el))
    return rows

def run_benchmarks():
    fixtures_dir = pathlib.Path("science/fixtures/horizons")
    G.load_kernels("kernels")

    sites = {
        "im-1": {"lat": -80.13, "lon": 1.44, "prefix": "im-1"},
        "blue-ghost-1": {"lat": 18.56, "lon": 61.81, "prefix": "blue-ghost-1"},
        "im-2": {"lat": -84.7906, "lon": 29.1957, "prefix": "im-2"},
        "apollo11": {"lat": 0.6875, "lon": 23.4333, "prefix": "apollo11"},
        "shackleton-rim": {"lat": -89.68, "lon": 129.0, "prefix": "shackleton-rim"},
        "farside-0N-180E": {"lat": 0.0, "lon": 180.0, "prefix": "farside-0N-180E"},
        "nearlimb-0N-90E": {"lat": 0.0, "lon": 90.0, "prefix": "nearlimb-0N-90E"},
    }

    report = {}

    for sname, sinfo in sites.items():
        lat = sinfo["lat"]
        lon = sinfo["lon"]
        prefix = sinfo["prefix"]
        pos, east, north, up = G.site_to_enu(lat, lon)

        sun_files = [f for f in fixtures_dir.glob(f"{prefix}_sun_*.json") if "_query" not in f.name]
        earth_files = [f for f in fixtures_dir.glob(f"{prefix}_earth_*.json") if "_query" not in f.name]

        if not sun_files or not earth_files:
            continue

        sun_rows = parse_fixture_rows(sun_files[0])
        earth_rows = parse_fixture_rows(earth_files[0])

        sun_el_diffs = []
        sun_az_diffs = []
        for t_str, h_az, h_el in sun_rows:
            et = G.spice.str2et(t_str)
            sp_az, sp_el = G.compute_topocentric_az_el(C.SUN_NAIF_ID, et, pos, east, north, up)
            sun_el_diffs.append(abs(sp_el - h_el))
            if abs(sp_el) < 88.0:
                sun_az_diffs.append(diff_angle(sp_az, h_az))

        earth_el_diffs = []
        earth_az_diffs = []
        for t_str, h_az, h_el in earth_rows:
            et = G.spice.str2et(t_str)
            sp_az, sp_el = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et, pos, east, north, up)
            earth_el_diffs.append(abs(sp_el - h_el))
            if abs(sp_el) < 88.0:
                earth_az_diffs.append(diff_angle(sp_az, h_az))

        r = {
            "rows": len(sun_rows),
            "sun_max_el": max(sun_el_diffs),
            "sun_mean_el": sum(sun_el_diffs) / len(sun_el_diffs),
            "sun_max_az": max(sun_az_diffs) if sun_az_diffs else 0.0,
            "sun_mean_az": sum(sun_az_diffs) / len(sun_az_diffs) if sun_az_diffs else 0.0,
            "earth_max_el": max(earth_el_diffs),
            "earth_mean_el": sum(earth_el_diffs) / len(earth_el_diffs),
            "earth_max_az": max(earth_az_diffs) if earth_az_diffs else 0.0,
            "earth_mean_az": sum(earth_az_diffs) / len(earth_az_diffs) if earth_az_diffs else 0.0,
        }
        report[sname] = r

        print(f"=== {sname.upper()} ({r['rows']} rows) ===")
        print(f"  SUN:   Max Elev Diff = {r['sun_max_el']:.5f}°, Mean Elev Diff = {r['sun_mean_el']:.5f}°, Max Az Diff = {r['sun_max_az']:.5f}°")
        print(f"  EARTH: Max Elev Diff = {r['earth_max_el']:.5f}°, Mean Elev Diff = {r['earth_mean_el']:.5f}°, Max Az Diff = {r['earth_max_az']:.5f}°\n")

    G.unload_kernels()
    return report

if __name__ == "__main__":
    run_benchmarks()
