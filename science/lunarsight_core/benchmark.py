"""
benchmark.py — Run complete Horizons golden benchmark against SPICE and generate validation artifact.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any, Dict

from lunarsight_core import constants as C
from lunarsight_core import geometry as G


def diff_angle(a: float, b: float) -> float:
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def parse_fixture_rows(json_path: Path):
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
        rows.append((parts[0], float(parts[3]), float(parts[4])))
    return rows


def run_benchmark(fixtures_dir: Path | str | None = None, kernels_dir: Path | str | None = None) -> Dict[str, Any]:
    root = Path(__file__).resolve().parent.parent.parent
    if fixtures_dir is None:
        fixtures_dir = root / "science" / "fixtures" / "horizons"
    else:
        fixtures_dir = Path(fixtures_dir)

    if kernels_dir is None:
        kernels_dir = root / "kernels"
    else:
        kernels_dir = Path(kernels_dir)

    G.load_kernels(kernels_dir)

    sites = {
        "im-1": {"name": "IM-1 (Malapert A)", "lat": -80.13, "lon": 1.44, "prefix": "im-1"},
        "blue-ghost-1": {"name": "Blue Ghost 1 (Mare Crisium)", "lat": 18.56, "lon": 61.81, "prefix": "blue-ghost-1"},
        "im-2": {"name": "IM-2 (Mons Mouton)", "lat": -84.7906, "lon": 29.1957, "prefix": "im-2"},
        "apollo11": {"name": "Apollo 11 (Mare Tranquillitatis)", "lat": 0.6875, "lon": 23.4333, "prefix": "apollo11"},
        "shackleton-rim": {"name": "Peak Near Shackleton", "lat": -89.68, "lon": 129.0, "prefix": "shackleton-rim"},
        "farside-0N-180E": {"name": "Far-side Control (0°N, 180°E)", "lat": 0.0, "lon": 180.0, "prefix": "farside-0N-180E"},
        "nearlimb-0N-90E": {"name": "Near-limb Control (0°N, 90°E)", "lat": 0.0, "lon": 90.0, "prefix": "nearlimb-0N-90E"},
    }

    per_fixture = {}
    overall_max_el = 0.0
    overall_max_az = 0.0
    total_rows = 0
    all_passed = True

    try:
        for site_key, sinfo in sites.items():
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

            site_max_el = max(max(sun_el_diffs), max(earth_el_diffs))
            site_max_az = max(
                max(sun_az_diffs) if sun_az_diffs else 0.0,
                max(earth_az_diffs) if earth_az_diffs else 0.0
            )

            overall_max_el = max(overall_max_el, site_max_el)
            overall_max_az = max(overall_max_az, site_max_az)
            rows_count = len(sun_rows)
            total_rows += rows_count

            passed = (site_max_el < 0.01) and (site_max_az < 0.01)
            if not passed:
                all_passed = False

            per_fixture[site_key] = {
                "name": sinfo["name"],
                "lat": lat,
                "lon": lon,
                "rows": rows_count,
                "sun_max_el_deg": round(max(sun_el_diffs), 6),
                "sun_mean_el_deg": round(sum(sun_el_diffs) / len(sun_el_diffs), 6),
                "sun_max_az_deg": round(max(sun_az_diffs) if sun_az_diffs else 0.0, 6),
                "sun_mean_az_deg": round(sum(sun_az_diffs) / len(sun_az_diffs) if sun_az_diffs else 0.0, 6),
                "earth_max_el_deg": round(max(earth_el_diffs), 6),
                "earth_mean_el_deg": round(sum(earth_el_diffs) / len(earth_el_diffs), 6),
                "earth_max_az_deg": round(max(earth_az_diffs) if earth_az_diffs else 0.0, 6),
                "earth_mean_az_deg": round(sum(earth_az_diffs) / len(earth_az_diffs) if earth_az_diffs else 0.0, 6),
                "max_el_diff_deg": round(site_max_el, 6),
                "max_az_diff_deg": round(site_max_az, 6),
                "tolerance_deg": 0.01,
                "passed": passed,
            }

    finally:
        G.unload_kernels()

    benchmark_data = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "total_fixtures": len(per_fixture),
        "total_rows_tested": total_rows,
        "overall_max_el_diff_deg": round(overall_max_el, 6),
        "overall_max_az_diff_deg": round(overall_max_az, 6),
        "tolerance_deg": 0.01,
        "all_passed": all_passed,
        "fixtures": per_fixture,
    }

    out_dirs = [
        root / "science" / "validation",
        root / "web" / "public" / "data",
        root / "web_public_data",
    ]
    for d in out_dirs:
        d.mkdir(parents=True, exist_ok=True)
        (d / "benchmark.json").write_text(json.dumps(benchmark_data, indent=2), encoding="utf-8")

    return benchmark_data


if __name__ == "__main__":
    res = run_benchmark()
    print(f"Benchmark completed: {res['total_rows_tested']} rows across {res['total_fixtures']} fixtures.")
    print(f"Overall Max El Diff: {res['overall_max_el_diff_deg']}°, Max Az Diff: {res['overall_max_az_diff_deg']}°")
    print(f"All Passed: {res['all_passed']}")
