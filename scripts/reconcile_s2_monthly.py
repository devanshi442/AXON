import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
sys.path.insert(0, str(root / "science"))

import numpy as np
from lunarsight_core import geometry as G
from api.services.analysis_service import analysis_service

MONTHS_2026 = [
    ("January", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", "2026-01-16T12:00:00Z"),
    ("February", "2026-02-01T00:00:00Z", "2026-03-01T00:00:00Z", "2026-02-15T00:00:00Z"),
    ("March", "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z", "2026-03-16T12:00:00Z"),
    ("April", "2026-04-01T00:00:00Z", "2026-05-01T00:00:00Z", "2026-04-16T00:00:00Z"),
    ("May", "2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z", "2026-05-16T12:00:00Z"),
    ("June", "2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z", "2026-06-16T00:00:00Z"),
    ("July", "2026-07-01T00:00:00Z", "2026-08-01T00:00:00Z", "2026-07-16T12:00:00Z"),
    ("August", "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z", "2026-08-16T12:00:00Z"),
    ("September", "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z", "2026-09-16T00:00:00Z"),
    ("October", "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", "2026-10-16T12:00:00Z"),
    ("November", "2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z", "2026-11-16T00:00:00Z"),
    ("December", "2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z", "2026-12-16T12:00:00Z"),
]

def main():
    analysis_service.load_kernels()
    
    results = {
        "metadata": {
            "description": "Exhaustive monthly illumination & visibility run for Connecting Ridge across 2026",
            "mast_height_m": 1.5,
            "threshold_deg": 0.0,
            "step_seconds": 3600,
            "horizon_mode": "terrain",
        },
        "monthly_data": []
    }
    
    sites = [
        {"id": "cs-connecting-ridge", "label": "region_center"},
        {"id": "cs-connecting-ridge-site", "label": "evaluated_crest"}
    ]
    
    print("=" * 120)
    print(f"{'Month':<10} | {'SubSolar Lat':<12} | {'Center Sun%':<11} {'Center Earth%':<13} {'Center Jnt%':<11} | {'Crest Sun%':<10} {'Crest Earth%':<12} {'Crest Jnt%':<10}")
    print("-" * 120)
    
    for month_name, start_utc, stop_utc, mid_utc in MONTHS_2026:
        # 1. Sub-solar latitude from SPICE
        et_mid = G.spice.str2et(mid_utc)
        pos, _ = G.spice.spkpos("SUN", et_mid, "MOON_ME", "LT+S", "MOON")
        _, _, subsolar_lat_rad = G.spice.reclat(pos)
        subsolar_lat_deg = round(float(np.degrees(subsolar_lat_rad)), 3)
        
        row_entry = {
            "month": month_name,
            "start_utc": start_utc,
            "stop_utc": stop_utc,
            "mid_utc": mid_utc,
            "subsolar_latitude_deg": subsolar_lat_deg,
            "sites": {}
        }
        
        row_metrics = {}
        for site_info in sites:
            s_id = site_info["id"]
            req_body = {
                "site_id": s_id,
                "start_utc": start_utc,
                "stop_utc": stop_utc,
                "step_seconds": 3600,
                "mast_height_m": 1.5,
                "horizon_mode": "terrain",
            }
            res = analysis_service.analyze_site(
                site_id=s_id,
                start_utc=start_utc,
                stop_utc=stop_utc,
                step_seconds=3600,
                mast_height_m=1.5,
                horizon_mode="terrain",
            )
            
            total_h = res["total_period_hours"]
            sun_pct = res["sun"]["percentage"]
            sun_h = res["sun"]["total_hours"]
            earth_pct = res["earth"]["percentage"]
            earth_h = res["earth"]["total_hours"]
            joint_pct = res["joint"]["percentage"]
            joint_h = res["joint"]["total_hours"]
            
            row_metrics[s_id] = {
                "request_body": req_body,
                "total_hours": total_h,
                "sun_pct": sun_pct,
                "sun_hours": sun_h,
                "earth_pct": earth_pct,
                "earth_hours": earth_h,
                "joint_pct": joint_pct,
                "joint_hours": joint_h,
                "elevation_m": res["site_elevation_m"],
                "dem_id": res["dem_id"],
                "coverage_tier": res["coverage_tier"],
                "flat_sun_pct": res["flat"]["sun"]["percentage"],
                "flat_earth_pct": res["flat"]["earth"]["percentage"],
            }
            row_entry["sites"][s_id] = row_metrics[s_id]
            
        c_sun = row_metrics["cs-connecting-ridge"]["sun_pct"]
        c_earth = row_metrics["cs-connecting-ridge"]["earth_pct"]
        c_jnt = row_metrics["cs-connecting-ridge"]["joint_pct"]
        
        cr_sun = row_metrics["cs-connecting-ridge-site"]["sun_pct"]
        cr_earth = row_metrics["cs-connecting-ridge-site"]["earth_pct"]
        cr_jnt = row_metrics["cs-connecting-ridge-site"]["joint_pct"]
        
        print(f"{month_name:<10} | {subsolar_lat_deg:+6.3f}°      | {c_sun:6.2f}%     {c_earth:6.2f}%       {c_jnt:6.2f}%     | {cr_sun:6.2f}%    {cr_earth:6.2f}%      {cr_jnt:6.2f}%")
        results["monthly_data"].append(row_entry)

    evidence_dir = root / "docs" / "verification" / "evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    out_file = evidence_dir / "s2_monthly_analysis_raw.json"
    out_file.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nSaved raw evidence JSON to: {out_file}")

if __name__ == "__main__":
    main()
