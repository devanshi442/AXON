"""
verify_s1_s3.py — Run S1 Seam Table and S3 48-Hour Regression Checks.
Produces raw output for docs/verification/evidence/s1_s3_regression.txt.
"""

import json
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.services.analysis_service import AnalysisService

def run_checks():
    lines = []
    lines.append("=" * 80)
    lines.append("PHASE 2: S1 SEAM TABLE AND S3 48-HOUR REGRESSION CHECKS")
    lines.append("=" * 80)

    svc = AnalysisService()
    svc.load_kernels()

    # -------------------------------------------------------------------------
    # PART A: S3 48-HOUR CHECK
    # -------------------------------------------------------------------------
    lines.append("\n--- PART A: S3 48-HOUR CHECK (-89.534, -150.052, 2026-03-01..03) ---")
    lat_s3 = -89.534
    lon_s3 = -150.052
    start_s3 = "2026-03-01T00:00:00Z"
    stop_s3 = "2026-03-03T00:00:00Z"

    res_s3 = svc.analyze_site(
        lat=lat_s3,
        lon=lon_s3,
        start_utc=start_s3,
        stop_utc=stop_s3,
        step_seconds=3600,
        mast_height_m=2.0,
        horizon_mode="terrain",
    )

    tot_h = res_s3["total_period_hours"]
    lines.append(f"Site: ({lat_s3}, {lon_s3}), mast=2.0m, terrain mode")
    lines.append(f"Total Period Hours: {tot_h}")
    assert tot_h == 48.0, f"Expected 48.0, got {tot_h}"

    sun = res_s3["sun"]
    earth = res_s3["earth"]
    joint = res_s3["joint"]

    lines.append(f"Sun Total Hours: {sun['total_hours']} ({sun['percentage']}%)")
    lines.append(f"Earth Total Hours: {earth['total_hours']} ({earth['percentage']}%)")
    lines.append(f"Joint Total Hours: {joint['total_hours']} ({joint['percentage']}%)")
    lines.append(f"Longest Dark Gap Hours: {sun.get('longest_dark_gap_hours')}")

    lines.append("\nSun Windows:")
    sun_dur_sum = 0.0
    for w in sun["windows"]:
        start_dt = w["start_utc"]
        end_dt = w["end_utc"]
        dur = w["duration_hours"]
        sun_dur_sum += dur
        lines.append(f"  {start_dt} to {end_dt} -> duration: {dur} h")
    lines.append(f"Sum of Sun Windows: {sun_dur_sum} h")

    # Assertions
    assert sun["total_hours"] == 38.0, f"Expected 38.0 h sun, got {sun['total_hours']}"
    assert abs(sun["percentage"] - 79.17) < 0.1, f"Expected 79.17% (rounded 79.2%), got {sun['percentage']}"
    assert sun_dur_sum <= tot_h
    assert joint["total_hours"] <= min(sun["total_hours"], earth["total_hours"])
    lines.append("-> S3 Assertions Verified: 38.0 h Sun, 79.2% Sun, sum(windows) <= period, joint <= min(sun, earth).")

    # -------------------------------------------------------------------------
    # PART B: S1 SEAM TABLE (18 POINTS)
    # -------------------------------------------------------------------------
    lines.append("\n--- PART B: S1 SEAM TABLE (2026-03-01T00:00:00Z to 2026-03-31T00:00:00Z, 720 h) ---")
    lines.append(f"{'Lat':>6} | {'Lon':>8} | {'Flat Sun %':>10} | {'Flat Sun h':>10} | {'Terr Sun %':>10} | {'Terr Dem':>12} | {'Tier':>5}")
    lines.append("-" * 75)

    lats = [0.0, 30.0, -30.0]
    lons = [180.0, -180.0, 179.9, -179.9, 170.0, -170.0]
    start_s1 = "2026-03-01T00:00:00Z"
    stop_s1 = "2026-03-31T00:00:00Z"  # 30 days = 720 h

    for lat in lats:
        for lon in lons:
            res = svc.analyze_site(
                lat=lat,
                lon=lon,
                start_utc=start_s1,
                stop_utc=stop_s1,
                step_seconds=3600,
                mast_height_m=1.5,
                horizon_mode="terrain",
            )
            flat_sun_pct = res["flat"]["sun"]["percentage"]
            flat_sun_h = res["flat"]["sun"]["total_hours"]
            terr_sun_pct = res["terrain"]["sun"]["percentage"] if res["terrain"] else flat_sun_pct
            dem_id = res.get("dem_id", "NONE")
            tier = res.get("coverage_tier", "T3")

            lines.append(f"{lat:+6.1f} | {lon:+8.1f} | {flat_sun_pct:10.1f} | {flat_sun_h:10.1f} | {terr_sun_pct:10.1f} | {dem_id:>12} | {tier:>5}")

    output = "\n".join(lines)
    print(output)
    out_file = ROOT / "docs" / "verification" / "evidence" / "s1_s3_regression.txt"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(output, encoding="utf-8")
    print(f"\nSaved raw evidence to {out_file}")

if __name__ == "__main__":
    run_checks()
