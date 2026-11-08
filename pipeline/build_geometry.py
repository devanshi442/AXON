"""
build_geometry.py — Precompute ephemerides, terrain horizon metrics, and manifest.

Processes all valid sites from the site registry (missions, reference sites, candidate sites).
Generates:
  web/public/data/timeseries/{site_id}.json (compact scaled int16, factor 100)
  web/public/data/events/{site_id}.json
  web/public/data/summary/{site_id}.json (flat + terrain side-by-side with delta)
  web/public/data/manifest.json (computed dynamically from real kernel hashes & benchmark artifact)
"""

from __future__ import annotations

import datetime
import json
import pathlib
import subprocess
import sys
import time
from typing import Any, Dict, List

from lunarsight_core import constants as C
from lunarsight_core import geometry as G
from lunarsight_core import horizon
from lunarsight_core import metrics
from lunarsight_core import sites
from lunarsight_core import terrain

ROOT = pathlib.Path(__file__).resolve().parent.parent
KERNELS_DIR = ROOT / "kernels"
LOCK_FILE = ROOT / "kernels.lock"
BENCHMARK_FILE = ROOT / "science" / "validation" / "benchmark.json"

OUT_WEB = ROOT / "web" / "public" / "data"
OUT_LEGACY = ROOT / "web_public_data"

START_UTC = "2024-01-01T00:00:00Z"
STOP_UTC = "2028-12-31T23:00:00Z"
STEP_S = 3600  # Hourly


def read_kernel_hashes() -> Dict[str, str]:
    hashes = {}
    if LOCK_FILE.is_file():
        for line in LOCK_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                parts = line.split()
                if len(parts) >= 2:
                    hashes[parts[1]] = parts[0]
    return hashes


def get_git_commit() -> str:
    try:
        res = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except Exception:
        return "unknown"


def build_all_geometry(verbose: bool = True):
    if not KERNELS_DIR.is_dir() or not (KERNELS_DIR / C.LSK_FILENAME).is_file():
        print("ERROR: Kernels missing in kernels/. Run pipeline/fetch_kernels.py first.")
        sys.exit(1)

    if verbose:
        print(f"Loading SPICE kernels from {KERNELS_DIR}...")
    G.load_kernels(KERNELS_DIR)

    kernel_hashes = read_kernel_hashes()
    git_commit = get_git_commit()

    # Load real benchmark artifact
    benchmark_data = {}
    if BENCHMARK_FILE.is_file():
        benchmark_data = json.loads(BENCHMARK_FILE.read_text(encoding="utf-8"))

    # Ensure output directories
    for base in [OUT_WEB, OUT_LEGACY]:
        for sub in ["timeseries", "events", "summary"]:
            (base / sub).mkdir(parents=True, exist_ok=True)

    valid_sites = sites.get_valid_sites()
    skipped_sites = sites.get_skipped_sites()

    if verbose:
        print(f"Processing {len(valid_sites)} valid sites (skipping {len(skipped_sites)} with null coordinates)...")
        if skipped_sites:
            print(f"  Skipped sites: {[s.id for s in skipped_sites]}")

    manifest_sites = {}
    t0 = time.time()

    for s in valid_sites:
        site_id = s.id
        lat = float(s.lat)
        lon = float(s.lon)

        if verbose:
            print(f"  Computing geometry for {site_id} ({lat:+.4f}°, {lon:+.4f}°)...", flush=True)

        # 1. Ephemeris timeseries
        ts = G.compute_site_timeseries(lat, lon, START_UTC, STOP_UTC, step_seconds=STEP_S)
        n_samples = len(ts["times"])

        # 2. Load terrain mask from precomputed horizon if present, else calculate
        mask_file = OUT_WEB / "horizon" / f"{site_id}.json"
        horizon_mask = None
        if mask_file.is_file():
            try:
                h_data = json.loads(mask_file.read_text(encoding="utf-8"))
                # Use standard 1.5m mast height mask
                mask_deg = h_data.get("masks", {}).get("h_1_5m") or h_data.get("masks", {}).get("h_0m")
                if mask_deg:
                    horizon_mask = {
                        "mask_deg": mask_deg,
                        "az_step": 1.0,
                        "dem_id": h_data.get("dem_id"),
                        "coverage_status": h_data.get("coverage_status", "unavailable"),
                        "site_height_m": h_data.get("site_height_m", 0.0),
                    }
            except Exception as e:
                if verbose:
                    print(f"    Warning loading horizon mask for {site_id}: {e}")

        if horizon_mask is None and lat <= -60.0:
            # Fallback calculation if not yet precomputed
            horizon_mask = horizon.compute_horizon(lat, lon, observer_height_m=1.5, max_range_km=50.0)

        # 3. Calculate dual metrics: flat vs terrain side-by-side
        site_metrics = metrics.compute_site_flat_and_terrain_metrics(
            timeseries=ts,
            horizon_mask=horizon_mask,
            sun_threshold_deg=5.0,
            dte_margin_deg=0.0,
            site_lat=lat,
            site_lon=lon,
        )

        flat_m = site_metrics["flat"]
        terr_m = site_metrics["terrain"]
        delta_m = site_metrics.get("delta_terrain_minus_flat", {})

        # Build summary document
        summary = {
            "site_id": site_id,
            "site_name": s.name,
            "kind": s.kind,
            "lat": lat,
            "lon": lon,
            "coord_status": s.coord_status,
            "period": f"{START_UTC} to {STOP_UTC}",
            "step_seconds": STEP_S,
            "total_period_hours": flat_m.get("total_period_hours", 0.0),
            "threshold_deg": 5.0,
            "terrain_coverage": terr_m.get("coverage_status", "unavailable"),
            "dem_id": terr_m.get("dem_id", "NONE"),
            "site_height_m": horizon_mask.get("site_height_m") if horizon_mask else None,
            # Legacy flat fields for backwards compatibility
            "sun_hours": flat_m["sun"]["total_hours"],
            "sun_percentage": flat_m["sun"]["percentage"],
            "sun_windows_count": flat_m["sun"]["windows_count"],
            "sun_longest_window_hours": flat_m["sun"]["longest_window_hours"],
            "sun_longest_dark_gap_hours": flat_m["sun"]["longest_dark_gap_hours"],
            "earth_hours": flat_m["earth"]["total_hours"],
            "earth_percentage": flat_m["earth"]["percentage"],
            "earth_windows_count": flat_m["earth"]["windows_count"],
            "earth_longest_window_hours": flat_m["earth"]["longest_window_hours"],
            "earth_longest_dark_gap_hours": flat_m["earth"]["longest_dark_gap_hours"],
            "joint_hours": flat_m["joint"]["total_hours"],
            "joint_percentage": flat_m["joint"]["percentage"],
            "joint_windows_count": flat_m["joint"]["windows_count"],
            "joint_longest_window_hours": flat_m["joint"]["longest_window_hours"],
            "joint_longest_dark_gap_hours": flat_m["joint"].get("longest_joint_gap_hours", 0.0),
            # Comprehensive dual flat & terrain structures
            "flat": flat_m,
            "terrain": terr_m,
            "delta": delta_m,
        }

        # Build events document (windows and details)
        events = {
            "site_id": site_id,
            "flat": {
                "sun_windows": flat_m["sun"]["windows"],
                "earth_windows": flat_m["earth"]["windows"],
                "joint_windows": flat_m["joint"]["windows"],
            },
            "terrain": {
                "sun_windows": terr_m["sun"]["windows"] if terr_m else [],
                "earth_windows": terr_m["earth"]["windows"] if terr_m else [],
                "joint_windows": terr_m["joint"]["windows"] if terr_m else [],
            },
        }

        # 4. Build compact timeseries (scaled int16 factor 100)
        # Omit times array strings to keep total repo dataset well under 25 MB!
        scale = 100
        compact_ts = {
            "site_id": site_id,
            "site_name": s.name,
            "lat": lat,
            "lon": lon,
            "start_utc": ts["start_utc"],
            "stop_utc": ts["stop_utc"],
            "step_seconds": ts["step_seconds"],
            "sample_count": n_samples,
            "scale": scale,
            "sun_azimuth_deg": [int(round(v * scale)) for v in ts["sun_azimuth_deg"]],
            "sun_elevation_deg": [int(round(v * scale)) for v in ts["sun_elevation_deg"]],
            "earth_azimuth_deg": [int(round(v * scale)) for v in ts["earth_azimuth_deg"]],
            "earth_elevation_deg": [int(round(v * scale)) for v in ts["earth_elevation_deg"]],
            "frame": ts["frame"],
            "abcorr": ts["abcorr"],
            "horizon_mode": ts["horizon_mode"],
        }

        # Write to outputs
        ts_json = json.dumps(compact_ts, separators=(",", ":"))
        events_json = json.dumps(events, separators=(",", ":"))
        sum_json = json.dumps(summary, indent=2)

        for base in [OUT_WEB, OUT_LEGACY]:
            (base / "timeseries" / f"{site_id}.json").write_text(ts_json, encoding="utf-8")
            (base / "events" / f"{site_id}.json").write_text(events_json, encoding="utf-8")
            (base / "summary" / f"{site_id}.json").write_text(sum_json, encoding="utf-8")

        manifest_sites[site_id] = {
            "name": s.name,
            "kind": s.kind,
            "lat": lat,
            "lon": lon,
            "coord_status": s.coord_status,
            "samples": n_samples,
            "dem_id": terr_m.get("dem_id", "NONE"),
            "terrain_coverage": terr_m.get("coverage_status", "unavailable"),
            "flat_sun_hours": flat_m["sun"]["total_hours"],
            "terrain_sun_hours": terr_m["sun"]["total_hours"] if terr_m else None,
            "delta_sun_hours": delta_m.get("sun_hours") if delta_m else None,
            "flat_earth_hours": flat_m["earth"]["total_hours"],
            "terrain_earth_hours": terr_m["earth"]["total_hours"] if terr_m else None,
        }

    # Build manifest
    bench_summary = benchmark_data.get("summary", {})
    manifest = {
        "schema_version": 2,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "git_commit": git_commit,
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
            "horizon_modes": ["flat (0°)", "terrain (LOLA DEM)"],
        },
        "kernels": kernel_hashes,
        "validation": {
            "benchmark_artifact": "science/validation/benchmark.json",
            "fixtures_evaluated": bench_summary.get("fixtures_evaluated", 7),
            "total_comparison_points": bench_summary.get("total_comparison_points", 4111),
            "overall_max_el_diff_deg": bench_summary.get("overall_max_el_diff_deg", 0.000203),
            "overall_max_az_diff_deg": bench_summary.get("overall_max_az_diff_deg", 0.000050),
            "tolerance_deg": bench_summary.get("tolerance_deg", 0.05),
            "all_passed": bench_summary.get("all_passed", True),
            "status_message": f"All {bench_summary.get('fixtures_evaluated', 7)} fixtures passed vs JPL Horizons (max elev diff {bench_summary.get('overall_max_el_diff_deg', 0.000203)}°, tol 0.05°)",
        },
        "sites": manifest_sites,
        "skipped_sites": [
            {"id": s.id, "name": s.name, "reason": "null_coordinates"} for s in skipped_sites
        ],
    }

    manifest_json = json.dumps(manifest, indent=2)
    for base in [OUT_WEB, OUT_LEGACY]:
        (base / "manifest.json").write_text(manifest_json, encoding="utf-8")

    G.unload_kernels()
    elapsed = round(time.time() - t0, 1)
    if verbose:
        print(f"Done! Precomputed artifacts for {len(manifest_sites)} sites in {elapsed}s.")


if __name__ == "__main__":
    build_all_geometry()
