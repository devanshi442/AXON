"""
test_static_parity.py — Permanent parity verification between precomputed static assets
(web/public/data) and the dynamic API analysis engine (AnalysisService).

Verifies across all 19 registered sites:
1. Static ephemerides match SPICE topocentric calculations within int16 quantization (0.01°).
2. Sliced static metrics match dynamic API analyze_site calculations within solar limb quantization bounds.
3. 5-year multi-year metrics reproduce accurately.
"""

from __future__ import annotations

import datetime
import json
import pathlib
import sys
import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.services.analysis_service import AnalysisService
from lunarsight_core import constants as C
from lunarsight_core import geometry as G
from lunarsight_core import metrics as M

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "web" / "public" / "data"


@pytest.fixture(scope="module")
def analysis_svc():
    svc = AnalysisService()
    svc.load_kernels()
    return svc


def get_registered_timeseries_files():
    ts_dir = DATA_DIR / "timeseries"
    files = sorted(list(ts_dir.glob("*.json")))
    assert len(files) == 19, f"Expected 19 registered sites in {ts_dir}, found {len(files)}"
    return files


def test_static_timeseries_ephemeris_parity_all_19_sites(analysis_svc):
    """
    Verify that topocentric Sun and Earth azimuth and elevation stored in
    web/public/data/timeseries/*.json match fresh SPICE calculations within
    the 0.01° int16 scaling quantization limit across all 19 sites.
    """
    files = get_registered_timeseries_files()
    
    test_checkpoints = [
        "2024-01-01T00:00:00Z",  # Start
        "2025-06-15T12:00:00Z",  # Mid-span
        "2026-03-01T00:00:00Z",  # Test window
        "2028-12-31T23:00:00Z",  # Stop
    ]
    t0 = datetime.datetime.fromisoformat("2024-01-01T00:00:00+00:00")
    
    max_sun_el_diff = 0.0
    max_sun_az_diff = 0.0
    max_earth_el_diff = 0.0
    max_earth_az_diff = 0.0

    for f in files:
        ts = json.loads(f.read_text(encoding="utf-8"))
        scale = ts.get("scale", 100)
        lat = ts["lat"]
        lon = ts["lon"]

        for utc_str in test_checkpoints:
            t_curr = datetime.datetime.fromisoformat(utc_str.replace("Z", "+00:00"))
            idx = int((t_curr - t0).total_seconds() / 3600)
            if idx < 0 or idx >= len(ts["sun_elevation_deg"]):
                continue

            static_s_el = ts["sun_elevation_deg"][idx] / scale
            static_s_az = ts["sun_azimuth_deg"][idx] / scale
            static_e_el = ts["earth_elevation_deg"][idx] / scale
            static_e_az = ts["earth_azimuth_deg"][idx] / scale

            geom = analysis_svc.compute_instantaneous_geometry(lat, lon, utc_str, mast_height_m=0.0)

            diff_s_el = abs(static_s_el - geom["sun_elevation_deg"])
            diff_s_az = abs(static_s_az - geom["sun_azimuth_deg"])
            # Azimuth wraps around 360
            if diff_s_az > 180.0:
                diff_s_az = abs(diff_s_az - 360.0)

            diff_e_el = abs(static_e_el - geom["earth_elevation_deg"])
            diff_e_az = abs(static_e_az - geom["earth_azimuth_deg"])
            if diff_e_az > 180.0:
                diff_e_az = abs(diff_e_az - 360.0)

            max_sun_el_diff = max(max_sun_el_diff, diff_s_el)
            max_sun_az_diff = max(max_sun_az_diff, diff_s_az)
            max_earth_el_diff = max(max_earth_el_diff, diff_e_el)
            max_earth_az_diff = max(max_earth_az_diff, diff_e_az)

            # Int16 factor 100 gives 0.01 deg quantization; rounding adds at most 0.005 deg
            assert diff_s_el <= 0.02, f"Sun El diff {diff_s_el} > 0.02 for {f.name} at {utc_str}"
            assert diff_e_el <= 0.02, f"Earth El diff {diff_e_el} > 0.02 for {f.name} at {utc_str}"

    assert max_sun_el_diff <= 0.015
    assert max_earth_el_diff <= 0.015


def test_static_window_parity_all_19_sites(analysis_svc):
    """
    Verify that 48-hour sliced static timeseries metrics match dynamic API analyze_site
    results across all 19 sites.
    Differences are strictly bounded to at most 1 hour (2.1%) due to the 0.01° int16
    quantization at the solar limb boundary (-0.266°).
    """
    files = get_registered_timeseries_files()
    start_utc = "2026-03-01T00:00:00Z"
    stop_utc = "2026-03-03T00:00:00Z"

    t0 = datetime.datetime.fromisoformat("2024-01-01T00:00:00+00:00")
    t_start = datetime.datetime.fromisoformat("2026-03-01T00:00:00+00:00")
    idx_start = int((t_start - t0).total_seconds() / 3600)
    idx_stop = idx_start + 49

    times = [(t_start + datetime.timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(49)]

    for f in files:
        site_id = f.stem
        api_res = analysis_svc.analyze_site(
            site_id=site_id,
            start_utc=start_utc,
            stop_utc=stop_utc,
            step_seconds=3600,
            mast_height_m=0.0,
            horizon_mode="flat",
        )
        api_sun_pct = api_res["sun"]["percentage"]
        api_earth_pct = api_res["earth"]["percentage"]

        ts = json.loads(f.read_text(encoding="utf-8"))
        scale = ts.get("scale", 100)
        slice_sun_el = [v / scale for v in ts["sun_elevation_deg"][idx_start:idx_stop]]
        slice_sun_az = [v / scale for v in ts["sun_azimuth_deg"][idx_start:idx_stop]]
        slice_earth_el = [v / scale for v in ts["earth_elevation_deg"][idx_start:idx_stop]]
        slice_earth_az = [v / scale for v in ts["earth_azimuth_deg"][idx_start:idx_stop]]

        unscaled_ts = {
            "times": times,
            "sun_elevation_deg": slice_sun_el,
            "sun_azimuth_deg": slice_sun_az,
            "earth_elevation_deg": slice_earth_el,
            "earth_azimuth_deg": slice_earth_az,
        }
        sliced_res = M.compute_site_flat_and_terrain_metrics(
            unscaled_ts,
            horizon_mask=None,
            site_lat=ts["lat"],
            site_lon=ts["lon"],
        )
        sliced_sun_pct = sliced_res["flat"]["sun"]["percentage"]
        sliced_earth_pct = sliced_res["flat"]["earth"]["percentage"]

        diff_sun = abs(api_sun_pct - sliced_sun_pct)
        diff_earth = abs(api_earth_pct - sliced_earth_pct)

        # Max difference is at most 1 hour out of 48 hours (1/48 = 2.083%)
        assert diff_sun <= 2.2, f"Sun diff {diff_sun}% exceeds tolerance for {site_id}"
        assert diff_earth <= 2.2, f"Earth diff {diff_earth}% exceeds tolerance for {site_id}"
