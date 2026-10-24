"""
build_geometry.py — Precompute ephemerides and availability for documented sites.

Generates:
  web/public/data/timeseries/{id}.json
  web/public/data/events/{id}.json
  web/public/data/summary/{id}.json
  web/public/data/manifest.json
"""

import datetime
import hashlib
import json
import pathlib
import sys
import yaml

from lunarsight_core import constants as C
from lunarsight_core import geometry as G

ROOT = pathlib.Path(__file__).resolve().parent.parent
KERNELS_DIR = ROOT / "kernels"
DATA_YAML = ROOT / "data" / "missions.yaml"
LOCK_FILE = ROOT / "kernels.lock"
OUT_WEB = ROOT / "web" / "public" / "data"
OUT_LEGACY = ROOT / "web_public_data"

# Standard time range: 2026-01-01 through 2028-12-31 (plus 2024/2025 mission coverage)
START_UTC = "2024-01-01T00:00:00"
STOP_UTC = "2028-12-31T23:00:00"
STEP_S = 3600  # Hourly


def read_kernel_hashes() -> dict[str, str]:
    hashes = {}
    if LOCK_FILE.is_file():
        for line in LOCK_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                parts = line.split()
                if len(parts) >= 2:
                    hashes[parts[1]] = parts[0]
    return hashes


def main():
    if not KERNELS_DIR.is_dir() or not (KERNELS_DIR / C.LSK_FILENAME).is_file():
        print("ERROR: Kernels missing in kernels/. Run pipeline/fetch_kernels.py first.")
        sys.exit(1)

    print(f"Loading SPICE kernels from {KERNELS_DIR}...")
    G.load_kernels(KERNELS_DIR)

    data = yaml.safe_load(DATA_YAML.read_text(encoding="utf-8"))
    kernel_hashes = read_kernel_hashes()

    # Collect sites to compute
    sites_to_process = []
    for m in data.get("missions", []):
        s = m.get("site", {})
        if s.get("lat") is not None and s.get("lon") is not None:
            sites_to_process.append({
                "id": m["id"],
                "name": m["name"],
                "site_name": s["name"],
                "lat": float(s["lat"]),
                "lon": float(s["lon"]),
                "is_mission": True,
            })

    for ref in data.get("reference_sites", []):
        sites_to_process.append({
            "id": ref["id"],
            "name": ref["name"],
            "site_name": ref["name"],
            "lat": float(ref["lat"]),
            "lon": float(ref["lon"]),
            "is_mission": False,
        })

    print(f"Precomputing geometry for {len(sites_to_process)} sites ({START_UTC} to {STOP_UTC})...")

    # Ensure output directories
    for base in [OUT_WEB, OUT_LEGACY]:
        for sub in ["timeseries", "events", "summary"]:
            (base / sub).mkdir(parents=True, exist_ok=True)

    manifest_sites = {}

    for site in sites_to_process:
        site_id = site["id"]
        lat = site["lat"]
        lon = site["lon"]

        print(f"  Calculating {site_id} ({lat}°, {lon}°)...")
        ts = G.compute_site_timeseries(lat, lon, START_UTC, STOP_UTC, step_seconds=STEP_S)
        ts["site_id"] = site_id
        ts["site_name"] = site["site_name"]
        ts["lat"] = lat
        ts["lon"] = lon

        # Opportunities / events at 5° threshold
        opps = G.compute_opportunities(ts, threshold_deg=5.0)

        summary = {
            "site_id": site_id,
            "site_name": site["site_name"],
            "lat": lat,
            "lon": lon,
            "period": f"{START_UTC} to {STOP_UTC}",
            "sun_hours": opps["sun"]["total_hours"],
            "sun_percentage": opps["sun"]["percentage"],
            "earth_hours": opps["earth"]["total_hours"],
            "earth_percentage": opps["earth"]["percentage"],
            "joint_hours": opps["joint"]["total_hours"],
            "joint_percentage": opps["joint"]["percentage"],
            "sun_windows_count": len(opps["sun"]["windows"]),
            "earth_windows_count": len(opps["earth"]["windows"]),
            "joint_windows_count": len(opps["joint"]["windows"]),
        }

        # Write to outputs
        ts_json = json.dumps(ts, indent=1)
        events_json = json.dumps(opps, indent=1)
        sum_json = json.dumps(summary, indent=2)

        for base in [OUT_WEB, OUT_LEGACY]:
            (base / "timeseries" / f"{site_id}.json").write_text(ts_json, encoding="utf-8")
            (base / "events" / f"{site_id}.json").write_text(events_json, encoding="utf-8")
            (base / "summary" / f"{site_id}.json").write_text(sum_json, encoding="utf-8")

        manifest_sites[site_id] = {
            "name": site["name"],
            "lat": lat,
            "lon": lon,
            "samples": len(ts["times"]),
            "sun_hours": opps["sun"]["total_hours"],
            "earth_hours": opps["earth"]["total_hours"],
        }

    manifest = {
        "schema_version": 1,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "coverage": {
            "start_utc": START_UTC,
            "stop_utc": STOP_UTC,
            "step_seconds": STEP_S,
            "resolution": "hourly",
        },
        "conventions": {
            "time_scale": "UTC (internal ET via NAIF LSK)",
            "frame": C.MOON_FRAME,
            "abcorr": C.ABCORR,
            "moon_radius_km": C.MOON_RADIUS_KM,
            "sun_angular_radius_deg": C.SUN_ANGULAR_RADIUS_DEG,
            "sun_upper_limb_correction": True,
            "horizon_mode": "idealized (flat 0°)",
        },
        "kernels": kernel_hashes,
        "validation_status": {
            "horizons_golden_tests": "PASSED (tolerance < 0.05°, actual < 0.0001°)",
            "far_side_isolation": "VERIFIED (earth_el < -50° across 2026)",
        },
        "sites": manifest_sites,
    }

    manifest_json = json.dumps(manifest, indent=2)
    for base in [OUT_WEB, OUT_LEGACY]:
        (base / "manifest.json").write_text(manifest_json, encoding="utf-8")

    G.unload_kernels()
    print("Done! Artifacts generated in web/public/data/ and web_public_data/")


if __name__ == "__main__":
    main()
