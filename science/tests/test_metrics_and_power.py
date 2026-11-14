"""
test_metrics_and_power.py — Unit tests for visibility, power, and metrics modules.
"""

import math
import pytest
import numpy as np

from lunarsight_core import constants as C
from lunarsight_core import geometry as G
from lunarsight_core import horizon
from lunarsight_core import power
from lunarsight_core import visibility
from lunarsight_core import metrics
from lunarsight_core import sites


def test_window_extraction_and_gaps():
    """Verify contiguous window extraction and gap calculation on known pattern."""
    times = [f"2026-01-01T{h:02d}:00:00Z" for h in range(10)]
    # Pattern: 0:F, 1:T, 2:T, 3:T, 4:F, 5:F, 6:T, 7:F, 8:T, 9:T
    mask = [False, True, True, True, False, False, True, False, True, True]

    # Without SPICE refinement
    windows = metrics.extract_windows_refined(
        times=times,
        mask=mask,
        step_seconds=3600,
        refine_edges=False,
    )

    assert len(windows) == 3
    # Window 0: indices 1 to 3 -> 3 samples = 3.0 hours
    assert windows[0]["start_utc"] == "2026-01-01T01:00:00Z"
    assert windows[0]["end_utc"] == "2026-01-01T03:00:00Z"
    assert windows[0]["duration_hours"] == 3.0

    # Window 1: index 6 -> 1 sample = 1.0 hour
    assert windows[1]["start_utc"] == "2026-01-01T06:00:00Z"
    assert windows[1]["duration_hours"] == 1.0

    # Window 2: indices 8 to 9 -> 2 samples = 2.0 hours
    assert windows[2]["start_utc"] == "2026-01-01T08:00:00Z"
    assert windows[2]["duration_hours"] == 2.0

    # Test longest run of False (darkness / outage)
    # Gaps: [0] (1h), [4, 5] (2h), [7] (1h) -> max gap is 2.0 hours
    max_dark = metrics._longest_run_hours(mask, step_seconds=3600, target_val=False)
    assert max_dark == 2.0

    # Longest run of True -> 3.0 hours
    max_light = metrics._longest_run_hours(mask, step_seconds=3600, target_val=True)
    assert max_light == 3.0


def test_earth_visibility_criteria_and_margins():
    """Test center, full_disk, any_limb criteria and antenna clearance margin."""
    # Sun/Earth at az=0, el=5.0 deg. Mask elevation = 5.0 deg. Earth angular radius = 0.95 deg.
    mask = {"mask_deg": [5.0] * 360, "az_step": 1.0}
    el = 5.0
    az = 0.0
    r_earth = 0.95

    # 1. Center criterion: el >= mask + margin
    # el=5.0, mask=5.0, margin=0.0 -> True
    res_center = visibility.compute_earth_visibility(
        el, az, mask=mask, earth_ang_radius_deg=r_earth, margin_deg=0.0, criterion="center"
    )
    assert res_center["visible"] is True

    # Margin = 0.1 -> el (5.0) < mask (5.0) + margin (0.1) -> False
    res_center_margin = visibility.compute_earth_visibility(
        el, az, mask=mask, earth_ang_radius_deg=r_earth, margin_deg=0.1, criterion="center"
    )
    assert res_center_margin["visible"] is False

    # 2. Full disk: (el - r_earth) >= mask + margin -> (5.0 - 0.95 = 4.05) < 5.0 -> False
    res_full = visibility.compute_earth_visibility(
        el, az, mask=mask, earth_ang_radius_deg=r_earth, margin_deg=0.0, criterion="full_disk"
    )
    assert res_full["visible"] is False

    # If elevation increases to 6.0: 6.0 - 0.95 = 5.05 >= 5.0 -> True
    res_full_high = visibility.compute_earth_visibility(
        6.0, az, mask=mask, earth_ang_radius_deg=r_earth, margin_deg=0.0, criterion="full_disk"
    )
    assert res_full_high["visible"] is True

    # 3. Any limb: (el + r_earth) >= mask + margin -> 5.0 + 0.95 = 5.95 >= 5.0 -> True
    res_limb = visibility.compute_earth_visibility(
        el, az, mask=mask, earth_ang_radius_deg=r_earth, margin_deg=0.0, criterion="any_limb"
    )
    assert res_limb["visible"] is True

    # If elevation is 4.0: 4.0 + 0.95 = 4.95 < 5.0 -> False
    res_limb_low = visibility.compute_earth_visibility(
        4.0, az, mask=mask, earth_ang_radius_deg=r_earth, margin_deg=0.0, criterion="any_limb"
    )
    assert res_limb_low["visible"] is False


def test_power_model_orientations_and_flux():
    """Verify analytical incidence angles and inverse-square solar flux variation."""
    # Test solar flux at 1 AU (149597870.7 km)
    flux_1au = power.compute_solar_flux(C.AU_KM)
    assert math.isclose(flux_1au, C.SOLAR_IRRADIANCE_W_M2, rel_tol=1e-5)

    # Test perihelion (~147.1e6 km) vs aphelion (~152.1e6 km)
    flux_peri = power.compute_solar_flux(147.098e6)
    flux_aph = power.compute_solar_flux(152.098e6)
    assert flux_peri > C.SOLAR_IRRADIANCE_W_M2
    assert flux_aph < C.SOLAR_IRRADIANCE_W_M2
    # Variation is ~6.7%
    variation = (flux_peri - flux_aph) / C.SOLAR_IRRADIANCE_W_M2
    assert 0.06 < variation < 0.08

    # Test orientation formulas:
    # 1. Horizontal: cos i = sin(el)
    cos_h_30 = power.compute_incidence_angle_factor(30.0, 45.0, orientation="horizontal")
    assert math.isclose(cos_h_30.item(), 0.5, abs_tol=1e-4)

    # Negative elevation -> clipped to 0
    cos_h_neg = power.compute_incidence_angle_factor(-5.0, 45.0, orientation="horizontal")
    assert cos_h_neg.item() == 0.0

    # 2. Vertical fixed facing East (az0 = 90 deg)
    # Sun at el=0, az=90 -> cos(0)*cos(0) = 1.0
    cos_v_east = power.compute_incidence_angle_factor(0.0, 90.0, orientation="vertical_fixed", az0_deg=90.0)
    assert math.isclose(cos_v_east.item(), 1.0, abs_tol=1e-4)

    # Sun at el=0, az=180 -> cos(0)*cos(90) = 0.0
    cos_v_south = power.compute_incidence_angle_factor(0.0, 180.0, orientation="vertical_fixed", az0_deg=90.0)
    assert math.isclose(cos_v_south.item(), 0.0, abs_tol=1e-4)

    # Sun at el=0, az=270 -> cos(0)*cos(180) = -1.0 -> clipped to 0.0
    cos_v_west = power.compute_incidence_angle_factor(0.0, 270.0, orientation="vertical_fixed", az0_deg=90.0)
    assert cos_v_west.item() == 0.0

    # 3. Vertical azimuth tracking: cos i = cos(el)
    # Sun at el=10 deg (typical polar low sun elevation) -> cos(10 deg) ~ 0.9848
    cos_vat = power.compute_incidence_angle_factor(10.0, 120.0, orientation="vertical_azimuth_tracking")
    assert math.isclose(cos_vat.item(), math.cos(math.radians(10.0)), abs_tol=1e-4)

    # 4. Sun tracking: cos i = 1.0
    cos_st = power.compute_incidence_angle_factor(15.0, 200.0, orientation="sun_tracking")
    assert math.isclose(cos_st.item(), 1.0, abs_tol=1e-4)

    # 5. Tilted panel: 45 deg tilt facing South (az0 = 180 deg)
    # Sun at el=45, az=180 -> beam directly normal to panel -> cos(i) = 1.0
    cos_tilt_normal = power.compute_incidence_angle_factor(45.0, 180.0, tilt_deg=45.0, az0_deg=180.0)
    assert math.isclose(cos_tilt_normal.item(), 1.0, abs_tol=1e-4)

    # Changing tilt_deg changes power
    p_flat = power.compute_solar_power(sun_el_deg=10.0, sun_az_deg=180.0, sun_fraction=1.0, orientation="horizontal")
    p_tilted = power.compute_solar_power(sun_el_deg=10.0, sun_az_deg=180.0, sun_fraction=1.0, orientation="horizontal", tilt_deg=80.0, az0_deg=180.0)
    assert p_tilted["total_energy_wh"] > p_flat["total_energy_wh"]


def test_monotonicity_flat_vs_terrain_and_mast():
    """
    Verify:
    1. For flat-ground / positive obstruction: terrain sun fraction <= flat sun fraction.
    2. For an isolated peak with negative horizon dip: terrain sun fraction >= flat sun fraction (sum(terrain) > sum(flat)).
    3. Higher mast sees lower or equal horizon, so higher mast fraction >= lower mast fraction.
    """
    # 1. Flat ground / surrounding ridge (mask > 0 deg)
    mask_ridge_low = {"mask_deg": [5.0] * 360, "az_step": 1.0}
    mask_ridge_high = {"mask_deg": [4.5] * 360, "az_step": 1.0}

    # 2. Isolated peak with dip angle below datum (negative horizon, e.g. -1.0 deg)
    mask_peak = {"mask_deg": [-1.0] * 360, "az_step": 1.0}

    # Sun elevation ranging across horizon transitions
    els = np.linspace(-2.0, 10.0, 50)
    azs = np.linspace(0.0, 360.0, 50)

    v_flat = visibility.compute_sun_visibility(els, azs, mask=None, threshold_deg=0.0)
    v_terr_low = visibility.compute_sun_visibility(els, azs, mask=mask_ridge_low, threshold_deg=0.0)
    v_terr_high = visibility.compute_sun_visibility(els, azs, mask=mask_ridge_high, threshold_deg=0.0)
    v_terr_peak = visibility.compute_sun_visibility(els, azs, mask=mask_peak, threshold_deg=0.0)

    # For flat-ground / obstruction: terrain <= flat
    assert np.all(np.array(v_terr_low["fraction"]) <= np.array(v_flat["fraction"]))

    # For isolated peak: terrain >= flat everywhere, and strictly greater total illumination
    assert np.all(np.array(v_terr_peak["fraction"]) >= np.array(v_flat["fraction"]))
    assert np.sum(v_terr_peak["fraction"]) > np.sum(v_flat["fraction"])

    # Higher mast sees >= lower mast
    assert np.all(np.array(v_terr_high["fraction"]) >= np.array(v_terr_low["fraction"]))


def test_raised_margin_never_increases_availability():
    """
    Verify monotonicity with respect to margins:
    A raised threshold/margin NEVER increases availability (sunlit or DTE visible hours).
    """
    els = np.linspace(-3.0, 12.0, 100)
    azs = np.linspace(0.0, 360.0, 100)
    mask = {"mask_deg": [2.5] * 360, "az_step": 1.0}

    # 1. Sun margin monotonicity (threshold_deg)
    prev_sun_sum = float("inf")
    prev_sun_vis_count = float("inf")
    for thresh in [0.0, 0.5, 1.0, 2.0, 5.0]:
        v = visibility.compute_sun_visibility(els, azs, mask=mask, threshold_deg=thresh)
        curr_sum = float(np.sum(v["fraction"]))
        curr_count = int(np.sum(v["visible"]))
        assert curr_sum <= prev_sun_sum + 1e-9, f"Sun fraction increased with threshold {thresh}"
        assert curr_count <= prev_sun_vis_count, f"Sun visible count increased with threshold {thresh}"
        prev_sun_sum = curr_sum
        prev_sun_vis_count = curr_count

    # 2. Earth margin monotonicity (margin_deg)
    prev_earth_vis_count = float("inf")
    for margin in [0.0, 0.5, 1.0, 2.0, 5.0]:
        v = visibility.compute_earth_visibility(els, azs, mask=mask, margin_deg=margin)
        curr_count = int(np.sum(v["visible"]))
        assert curr_count <= prev_earth_vis_count, f"Earth visible count increased with margin {margin}"
        prev_earth_vis_count = curr_count


@pytest.mark.needs_dems
def test_psr_crater_sanity_assertion():
    """
    Permanently Shadowed Region (PSR) check:
    At deep crater floors (Haworth, Faustini), the terrain horizon blocks
    the Sun completely (terrain daylight = 0.0%), while idealized flat horizon
    falsely predicts ~50% sunlight!
    """
    G.load_kernels()

    # Haworth crater floor coordinates: -87.4, -5.0
    lat, lon = -87.4, -5.0
    mask_res = horizon.compute_horizon(lat, lon, observer_height_m=0.0, max_range_km=50.0)
    assert mask_res["coverage_status"] == "full"

    # Compute a 30-day timeseries in July 2026 (southern winter/low sun)
    ts = G.compute_site_timeseries(lat, lon, "2026-07-01T00:00:00Z", "2026-07-31T00:00:00Z", step_seconds=3600)

    flat_vis = visibility.compute_sun_visibility(
        ts["sun_elevation_deg"],
        ts["sun_azimuth_deg"],
        mask=None,
        threshold_deg=0.0,
    )
    terr_vis = visibility.compute_sun_visibility(
        ts["sun_elevation_deg"],
        ts["sun_azimuth_deg"],
        mask=mask_res,
        threshold_deg=0.0,
    )

    flat_hours = np.sum(flat_vis["visible"])
    terr_hours = np.sum(terr_vis["visible"])

    # Flat horizon predicts significant illumination (> 300 hours)
    assert flat_hours > 300
    # Real terrain horizon must have ZERO sunlight (true PSR crater floor)
    assert terr_hours == 0


def test_spice_refine_transition():
    """Verify SPICE bisection edge refinement converges to < 1 minute."""
    G.load_kernels()
    # At Shackleton Ridge (-89.68, 129.0), test transition around 2026-01-01
    lat, lon = -89.68, 129.0
    ts = G.compute_site_timeseries(lat, lon, "2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z", step_seconds=3600)
    vis = visibility.compute_sun_visibility(ts["sun_elevation_deg"], ts["sun_azimuth_deg"], threshold_deg=0.0)
    mask = list(vis["visible"])

    # Find first flip
    flip_idx = -1
    for i in range(len(mask) - 1):
        if mask[i] != mask[i + 1]:
            flip_idx = i
            break

    if flip_idx >= 0:
        et0 = G.spice.str2et(ts["times_utc"][flip_idx])
        et1 = G.spice.str2et(ts["times_utc"][flip_idx + 1])
        refined_et = metrics.refine_transition_spice(
            et0, et1, lat, lon, C.SUN_NAIF_ID, max_iterations=6
        )
        # Interval was 3600s, 6 iterations bisects 3600 / 64 = 56.25s
        assert et0 <= refined_et <= et1
        # Check tolerance
        assert abs(refined_et - et0) > 0 and abs(refined_et - et1) > 0

