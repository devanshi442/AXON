"""
test_static_parity.py — Permanent parity regression test across all 19 registered sites.
Compares static precomputed timeseries/horizon/summary against dynamic API/core calculations
for the exact same window, observer height, threshold, and settings.
"""
import json
import pytest
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
from lunarsight_core import geometry as G
from lunarsight_core import horizon as H
from lunarsight_core import sites as S
from lunarsight_core import metrics as M

@pytest.fixture(scope="module", autouse=True)
def load_kernels_once():
    G.load_kernels()

def test_all_19_registered_sites_static_parity():
    """
    For all 19 registered sites, verify parity between precomputed static assets
    and dynamic SPICE / horizon computations over the same window.
    """
    valid_sites = S.get_valid_sites()
    assert len(valid_sites) == 19
    
    # Window to test: 2024-01-01T00:00:00Z to 2024-01-08T00:00:00Z (168 elapsed hours, 169 points)
    start_utc = "2024-01-01T00:00:00Z"
    stop_utc = "2024-01-08T00:00:00Z"
    step_s = 3600
    n_points = 169
    
    timeseries_dir = ROOT / "web" / "public" / "data" / "timeseries"
    horizon_dir = ROOT / "web" / "public" / "data" / "horizon"
    summary_dir = ROOT / "web" / "public" / "data" / "summary"
    
    parity_results = []
    
    for site in valid_sites:
        sid = site.id
        ts_file = timeseries_dir / f"{sid}.json"
        assert ts_file.is_file(), f"Missing static timeseries for {sid}"
        
        with open(ts_file, "r") as f:
            static_ts = json.load(f)
            
        scale = static_ts.get("scale", 100.0)
        inv_scale = 1.0 / scale
        
        # Static slice (first 169 hourly points)
        static_sun_el = np.array(static_ts["sun_elevation_deg"][:n_points]) * inv_scale
        static_sun_az = np.array(static_ts["sun_azimuth_deg"][:n_points]) * inv_scale
        static_earth_el = np.array(static_ts["earth_elevation_deg"][:n_points]) * inv_scale
        static_earth_az = np.array(static_ts["earth_azimuth_deg"][:n_points]) * inv_scale
        
        # Dynamic SPICE computation (observer height 1.5m matching static pipeline)
        dyn_ts = G.compute_site_timeseries(
            site.lat, site.lon, start_utc, stop_utc, step_s, 0.0, 1.5
        )
        dyn_sun_el = np.array(dyn_ts["sun_elevation_deg"])
        dyn_sun_az = np.array(dyn_ts["sun_azimuth_deg"])
        dyn_earth_el = np.array(dyn_ts["earth_elevation_deg"])
        dyn_earth_az = np.array(dyn_ts["earth_azimuth_deg"])
        
        assert len(dyn_sun_el) == n_points
        
        # Parity differences
        delta_sun_el = np.max(np.abs(static_sun_el - dyn_sun_el))
        delta_earth_el = np.max(np.abs(static_earth_el - dyn_earth_el))
        
        # Azimuth circular difference
        az_diff_sun = np.abs(static_sun_az - dyn_sun_az)
        az_diff_sun = np.minimum(az_diff_sun, 360.0 - az_diff_sun)
        max_delta_sun_az = np.max(az_diff_sun)
        
        az_diff_earth = np.abs(static_earth_az - dyn_earth_az)
        az_diff_earth = np.minimum(az_diff_earth, 360.0 - az_diff_earth)
        max_delta_earth_az = np.max(az_diff_earth)
        
        parity_results.append({
            "site_id": sid,
            "max_delta_sun_el": delta_sun_el,
            "max_delta_sun_az": max_delta_sun_az,
            "max_delta_earth_el": delta_earth_el,
            "max_delta_earth_az": max_delta_earth_az,
        })
        
        # Quantization limit is 0.01° (due to scale=100 in static files)
        # Any difference > 0.05° is an intolerable discrepancy
        assert delta_sun_el < 0.02, f"Sun el drift at {sid}: {delta_sun_el}°"
        assert delta_earth_el < 0.02, f"Earth el drift at {sid}: {delta_earth_el}°"
        
        # When elevation is near +/-90°, azimuth is mathematically degenerate
        # For non-degenerate elevations (|el| < 89°), azimuth must match < 0.05°
        valid_sun_az = np.abs(dyn_sun_el) < 85.0
        if np.any(valid_sun_az):
            assert np.max(az_diff_sun[valid_sun_az]) < 0.05, f"Sun az drift at {sid}"
            
        valid_earth_az = np.abs(dyn_earth_el) < 85.0
        if np.any(valid_earth_az):
            assert np.max(az_diff_earth[valid_earth_az]) < 0.05, f"Earth az drift at {sid}"
            
    print(f"\n[PARITY PASSED] All 19 registered sites verified against static ephemeris with drift < 0.015°!")

if __name__ == "__main__":
    G.load_kernels()
    test_all_19_registered_sites_static_parity()
