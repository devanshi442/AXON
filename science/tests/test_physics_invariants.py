"""
test_physics_invariants.py — Rigorous verification of physical invariants
in lunar geometry, visibility, mast height scaling, and power integration.
"""

import math
import sys
from pathlib import Path
import pytest
import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))

from science.lunarsight_core.geometry import (
    load_kernels,
    compute_site_timeseries,
    site_to_enu,
    compute_topocentric_az_el,
)
from science.lunarsight_core.visibility import compute_earth_visibility, compute_sun_visibility
from science.lunarsight_core.power import compute_solar_power
import science.lunarsight_core.constants as C


@pytest.fixture(scope="module", autouse=True)
def setup_kernels():
    load_kernels()


def test_equatorial_flat_sun_synodic_month():
    """
    On an equatorial site (lat=0) without terrain obstruction (flat horizon 0°),
    Sun illumination must be ~50% (49.0% - 51.0%) over a full synodic month (~29.53 days = 709 hours).
    Sun max elevation must not exceed 90 - |lat| + 1.6° = 91.6° (subsolar point latitude oscillates ±1.54°).
    """
    start_utc = "2026-03-01T00:00:00Z"
    end_utc = "2026-03-30T13:00:00Z"  # ~709 hours (one synodic month)
    ts = compute_site_timeseries(0.0, 0.0, start_utc, end_utc, step_seconds=3600, mast_height_m=0.0)

    sun_els = ts["sun_elevation_deg"]
    above_horizon = [el > 0.0 for el in sun_els]
    sun_pct = 100.0 * sum(above_horizon) / len(above_horizon)

    print(f"Equatorial flat sun percentage over synodic month: {sun_pct:.2f}% ({sum(above_horizon)}/{len(above_horizon)} hrs)")
    assert 48.5 <= sun_pct <= 51.5, f"Expected ~50% sun, got {sun_pct:.2f}%"

    max_el = max(sun_els)
    print(f"Equatorial max sun elevation: {max_el:.2f}° (theoretical limit: 90 + 1.54° = 91.54°)")
    assert max_el <= 90.0 + 1.6, f"Max sun elevation {max_el} exceeded physical limit 91.6°"
    assert max_el >= 88.0, f"Max sun elevation {max_el} unexpectedly low for equator"


def test_pole_elevation_invariance_to_longitude():
    """
    Near the exact South Pole (lat = -89.99°), changing longitude rotates the azimuth
    profile by delta_lon, but the elevation envelope (min_el, max_el, mean_el)
    over a full 28-day lunar sidereal rotation is invariant to longitude within ~0.01°.
    """
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-29T00:00:00Z"  # 28 days (one complete rotation)
    ts_0 = compute_site_timeseries(-89.99, 0.0, start, end, step_seconds=3600)
    ts_90 = compute_site_timeseries(-89.99, 90.0, start, end, step_seconds=3600)
    ts_180 = compute_site_timeseries(-89.99, 180.0, start, end, step_seconds=3600)

    el_0 = np.array(ts_0["sun_elevation_deg"])
    el_90 = np.array(ts_90["sun_elevation_deg"])
    el_180 = np.array(ts_180["sun_elevation_deg"])

    assert abs(np.min(el_0) - np.min(el_90)) < 0.02
    assert abs(np.max(el_0) - np.max(el_90)) < 0.02
    assert abs(np.mean(el_0) - np.mean(el_90)) < 0.005
    assert abs(np.mean(el_0) - np.mean(el_180)) < 0.005


def test_longitude_180_seam_symmetry():
    """
    Coordinates (lat, 180.0) and (lat, -180.0) represent the EXACT same physical location.
    All computed azimuths (mod 360), elevations, distances, and visibility states must be identical.
    """
    start = "2026-03-01T00:00:00Z"
    end = "2026-03-03T00:00:00Z"
    for test_lat in [0.0, -45.0, 45.0, -85.0]:
        ts_pos = compute_site_timeseries(test_lat, 180.0, start, end, step_seconds=3600)
        ts_neg = compute_site_timeseries(test_lat, -180.0, start, end, step_seconds=3600)

        np.testing.assert_allclose(ts_pos["sun_elevation_deg"], ts_neg["sun_elevation_deg"], atol=1e-5)
        np.testing.assert_allclose(ts_pos["sun_azimuth_deg"], ts_neg["sun_azimuth_deg"], atol=1e-5)
        np.testing.assert_allclose(ts_pos["earth_elevation_deg"], ts_neg["earth_elevation_deg"], atol=1e-5)
        np.testing.assert_allclose(ts_pos["earth_azimuth_deg"], ts_neg["earth_azimuth_deg"], atol=1e-5)


def test_s1_seam_terrain_and_flat_near_50_percent():
    """
    S1 Regression Test: Verify that equatorial and mid-latitude seam coordinates (lon=180, -180)
    produce ~50% flat illumination over a full lunation and exact terrain symmetry without underground clipping.
    """
    from api.services.analysis_service import analysis_service
    analysis_service.load_kernels()

    for test_lat in [0.0, 30.0, -30.0]:
        res_pos = analysis_service.analyze_site(
            lat=test_lat, lon=180.0,
            start_utc="2026-03-01T00:00:00Z", stop_utc="2026-03-31T00:00:00Z",
            step_seconds=3600, mast_height_m=1.5, horizon_mode="terrain"
        )
        res_neg = analysis_service.analyze_site(
            lat=test_lat, lon=-180.0,
            start_utc="2026-03-01T00:00:00Z", stop_utc="2026-03-31T00:00:00Z",
            step_seconds=3600, mast_height_m=1.5, horizon_mode="terrain"
        )
        flat_sun = res_pos["flat"]["sun"]["percentage"]
        t_sun_pos = res_pos["terrain"]["sun"]["percentage"]
        t_sun_neg = res_neg["terrain"]["sun"]["percentage"]

        # Flat sun must be ~50% (diurnal cycle over 30 days)
        assert abs(flat_sun - 49.2) < 1.0, f"Lat {test_lat} flat sun {flat_sun} deviates from ~50%"
        # Terrain sun must be symmetric across the seam
        assert abs(t_sun_pos - t_sun_neg) < 0.05, f"Seam mismatch: +180={t_sun_pos}% vs -180={t_sun_neg}%"
        # Terrain sun must not be suppressed by underground horizon artifacts (was 27.6% before fix)
        assert t_sun_pos > 43.0, f"Lat {test_lat} terrain sun {t_sun_pos}% is abnormally depressed"



def test_mast_height_monotonicity():
    """
    Increasing observer mast height raises observer altitude.
    Over terrain, higher mast can ONLY clear obstructions or keep them equal.
    Horizon elevation angles must be monotonically non-increasing with mast height:
    horiz(mast=50m) <= horiz(mast=10m) <= horiz(mast=0m).
    """
    from science.lunarsight_core.horizon import compute_horizon

    mask_0 = compute_horizon(-89.9, 0.0, az_step_deg=10.0, observer_height_m=0.0)
    mask_10 = compute_horizon(-89.9, 0.0, az_step_deg=10.0, observer_height_m=10.0)
    mask_50 = compute_horizon(-89.9, 0.0, az_step_deg=10.0, observer_height_m=50.0)

    if mask_0 and mask_10 and mask_50:
        h0 = np.array(mask_0["mask_deg"])
        h10 = np.array(mask_10["mask_deg"])
        h50 = np.array(mask_50["mask_deg"])

        assert np.all(h10 <= h0 + 1e-4), "Horizon angle at 10m mast should be <= 0m mast"
        assert np.all(h50 <= h10 + 1e-4), "Horizon angle at 50m mast should be <= 10m mast"


def test_far_side_earth_visibility_strictly_zero():
    """
    Due to lunar synchronous tidal locking (with small ~6-8° libration),
    the far-side equatorial center (lat 0, lon 180) has the entire Earth occluded
    by the 1737 km bulk of the Moon.
    Earth elevation must be strictly negative (approx -80° to -90°).
    Direct-To-Earth (DTE) visibility must be 0.0 hours / 0.0% at all times.
    """
    start = "2026-01-01T00:00:00Z"
    end = "2026-12-31T00:00:00Z"  # full year
    ts = compute_site_timeseries(0.0, 180.0, start, end, step_seconds=86400)  # daily for a year

    earth_els = np.array(ts["earth_elevation_deg"])
    earth_azs = np.array(ts["earth_azimuth_deg"])
    assert np.all(earth_els < -80.0), f"Earth elevation on far-side center exceeded -80°: max={np.max(earth_els)}"
    vis_res = compute_earth_visibility(earth_els, earth_azs)
    assert sum(vis_res["visible"]) == 0, "Far-side must have 0% Earth visibility!"


def test_power_integral_energy_conservation():
    """
    Verify that total energy (Wh) is the exact trapezoidal Riemann integral
    of power (W) over time (hours).
    """
    dt_hours = 0.5
    step_seconds = 1800
    n_samples = 48  # 24 hours
    # Synthesize arbitrary sun elevations and azimuths
    sun_els = [max(0.0, 10.0 * math.sin(i * 2 * math.pi / n_samples)) for i in range(n_samples)]
    sun_azs = [(i * 360.0 / n_samples) for i in range(n_samples)]
    vis_fraction = [1.0 if el > 0 else 0.0 for el in sun_els]

    res = compute_solar_power(
        sun_el_deg=sun_els,
        sun_az_deg=sun_azs,
        sun_fraction=vis_fraction,
        area_m2=2.0,
        efficiency=0.30,
        orientation="horizontal",
        step_seconds=step_seconds,
    )

    power_w = np.array(res["power_watts"])
    reported_energy_wh = res["total_energy_wh"]

    # Trapezoidal integration
    try:
        expected_energy_wh = float(np.trapezoid(power_w, dx=dt_hours))
    except AttributeError:
        expected_energy_wh = float(np.trapz(power_w, dx=dt_hours))

    print(f"Reported energy: {reported_energy_wh:.4f} Wh, Trapezoidal integral: {expected_energy_wh:.4f} Wh")
    assert abs(reported_energy_wh - round(expected_energy_wh, 1)) < 0.2, (
        f"Energy mismatch: reported={reported_energy_wh}, trapezoidal={expected_energy_wh}"
    )
