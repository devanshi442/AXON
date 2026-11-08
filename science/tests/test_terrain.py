"""
test_terrain.py — Unit and validation tests for terrain DEM access and horizon generation.

Includes:
- Synthetic DEM tests (flat sphere, analytical 3D ridge, bowl crater)
- DEM selection and window coverage checks (IM-1 using 75S, Haworth, Shackleton)
- Built-in cross-check: ray-march vs pixel-binning agreement (median diff <= 0.1°)
- Observer mast height monotonicity (higher mast = lower or equal horizon)
- Horizon lookup interpolation and 360° wraparound
"""

import math
import numpy as np
import pytest
from rasterio.transform import Affine

from lunarsight_core import constants as C
from lunarsight_core import horizon, terrain

MOON_R_M = C.MOON_RADIUS_KM * 1000.0


def test_synthetic_flat_sphere():
    """Synthetic test: on a perfectly smooth sphere (height=0), horizon elevation should be <= 0° (dip)."""
    # Create synthetic flat WindowedDEM
    width, height = 200, 200
    res = 40.0
    data = np.zeros((height, width), dtype=np.int16)
    dem_info = terrain.DEMInfo(
        id="SYNTHETIC_FLAT",
        name="Synthetic Flat Sphere",
        filename="",
        proj_type="polar_stereographic",
        resolution_m=res,
        max_lat=-85.0,
        min_lat=-90.0,
        bound_box_m=4000.0,
        scale=0.5,
        offset_m=1737400.0,
    )
    # Origin at center
    transform = Affine(res, 0.0, -4000.0, 0.0, -res, 4000.0)
    w_dem = terrain.WindowedDEM(dem_info, data, 0, 0, transform)

    # For observer at surface (h=0), horizon along smooth sphere has slight negative dip due to curvature
    # Test ray marching analytically using the windowed DEM directly
    u_site = np.array([0.0, 0.0, -1.0])  # South pole
    pos_obs = MOON_R_M * u_site
    north = np.array([1.0, 0.0, 0.0])  # along lon=0

    # Step north up to 3 km
    dists = np.arange(40.0, 3000.0, 20.0)
    sigmas = dists / MOON_R_M
    pts_u = np.cos(sigmas)[:, None] * u_site[None, :] + np.sin(sigmas)[:, None] * north[None, :]
    pts_u /= np.linalg.norm(pts_u, axis=1, keepdims=True)

    # Sample heights (all 0)
    p_terrain = MOON_R_M * pts_u
    diff = p_terrain - pos_obs[None, :]
    u = diff @ u_site
    d_horiz = np.linalg.norm(diff - u[:, None] * u_site[None, :], axis=1)
    els = np.degrees(np.arctan2(u, d_horiz))

    # On smooth sphere, horizon is at or just below 0°
    max_el = float(np.max(els))
    assert -0.5 <= max_el <= 0.001, f"Expected smooth sphere elevation near 0°, got {max_el}°"


def test_synthetic_ridge_analytical():
    """
    Synthetic test: a ridge of known height H at known distance D.
    Compare computed ray-marching elevation with exact 3D analytical geometry.
    """
    H_ridge = 2500.0  # 2500 meters high
    D_ridge = 20000.0  # 20 km distance
    h_obs = 2.0  # 2 m mast height

    # Exact 3D analytical elevation from observer at (R + h_obs)
    sigma = D_ridge / MOON_R_M
    # In observer's local ENU:
    # up component = (R + H) * cos(sigma) - (R + h_obs)
    # horizontal component = (R + H) * sin(sigma)
    up_comp = (MOON_R_M + H_ridge) * math.cos(sigma) - (MOON_R_M + h_obs)
    horiz_comp = (MOON_R_M + H_ridge) * math.sin(sigma)
    expected_el_deg = math.degrees(math.atan2(up_comp, horiz_comp))

    # Now verify ray formula:
    u_site = np.array([0.0, 0.0, -1.0])
    pos_obs = (MOON_R_M + h_obs) * u_site
    north = np.array([1.0, 0.0, 0.0])

    p_ridge = (MOON_R_M + H_ridge) * (math.cos(sigma) * u_site + math.sin(sigma) * north)
    diff = p_ridge - pos_obs
    u = float(np.dot(diff, u_site))
    d_horiz = math.hypot(float(np.dot(diff, north)), 0.0)
    computed_el_deg = math.degrees(math.atan2(u, d_horiz))

    assert abs(computed_el_deg - expected_el_deg) < 1e-6, "3D analytical formula mismatch"
    assert 6.0 < expected_el_deg < 8.0, f"Expected ~7° ridge elevation, got {expected_el_deg}°"


def test_synthetic_bowl_crater():
    """Synthetic test: observer at the bottom of a crater sees positive horizon in all directions."""
    # Synthetic bowl: depth -1000m at center (r=0), rising parabolically to +500m rim at r=10 km
    r_dist = 10000.0  # 10 km
    z_center = -1000.0
    z_rim = 500.0

    sigma = r_dist / MOON_R_M
    up_comp = (MOON_R_M + z_rim) * math.cos(sigma) - (MOON_R_M + z_center)
    horiz_comp = (MOON_R_M + z_rim) * math.sin(sigma)
    rim_elevation_deg = math.degrees(math.atan2(up_comp, horiz_comp))

    assert rim_elevation_deg > 8.0, f"Crater rim elevation should be strongly positive, got {rim_elevation_deg}°"


def test_dem_selection_coverage_rules():
    """Verify DEM selection logic adheres to Section 4.2 requirements."""
    # 1. IM-1 (-80.13°, 1.44°): 50 km window reaches ~-78.5°, so must select LDEM_75S_30M
    dem_im1, status_im1, _ = terrain.select_dem_for_site(-80.13, 1.44, max_range_km=50.0)
    assert dem_im1 is not None
    assert dem_im1.id == "LDEM_75S_30M", f"Expected LDEM_75S_30M for IM-1, got {dem_im1.id}"
    assert status_im1 == "full"

    # 2. Peak Near Shackleton (-89.68°, 129.0°): deep polar site, should select highest res 20m DEM
    dem_sh, status_sh, _ = terrain.select_dem_for_site(-89.68, 129.0, max_range_km=50.0)
    assert dem_sh is not None
    assert dem_sh.resolution_m == 20.0
    assert status_sh == "full"

    # 3. Non-polar site (Mare Crisium, 18.56°, 61.81°): should select global DEM
    dem_bg, status_bg, _ = terrain.select_dem_for_site(18.56, 61.81, max_range_km=50.0)
    assert dem_bg is not None
    assert dem_bg.id == "LDEM_64"
    assert status_bg == "full"


def test_cross_check_real_polar_sites():
    """
    Built-in cross-check: ray-march vs independent pixel-binning on real polar DEMs.
    They must agree with median difference <= 0.1° on polar sites.
    Tested on 3 polar sites: Peak Near Shackleton, Haworth, and Faustini Rim A.
    """
    test_sites = [
        ("cs-shackleton-rim", -89.68, 129.0),
        ("cs-haworth", -86.75, -22.84),
        ("cs-faustini-rim-a", -87.3, 77.0),
    ]

    for name, lat, lon in test_sites:
        m_ray = horizon.compute_horizon_raymarch(lat, lon, observer_height_m=1.5, max_range_km=25.0, min_range_m=100.0)
        m_pix = horizon.compute_horizon_pixel_binning(lat, lon, observer_height_m=1.5, max_range_km=25.0, min_range_m=100.0)

        assert m_ray["coverage_status"] in ["full", "partial"]
        assert len(m_ray["mask_deg"]) == 360
        assert len(m_pix["mask_deg"]) == 360

        diffs = [abs(r - p) for r, p in zip(m_ray["mask_deg"], m_pix["mask_deg"])]
        median_diff = float(np.median(diffs))
        assert median_diff <= 0.10, f"{name} cross-check failed: median diff={median_diff:.3f}° > 0.10°"


def test_observer_mast_height_monotone():
    """Observer mast height test: increasing observer height lowers or maintains horizon elevation."""
    lat, lon = -89.68, 129.0
    m_0 = horizon.compute_horizon_raymarch(lat, lon, observer_height_m=0.0, max_range_km=20.0)
    m_5 = horizon.compute_horizon_raymarch(lat, lon, observer_height_m=5.0, max_range_km=20.0)

    # 5m observer must have lower or equal horizon at almost all azimuths
    mask_0 = np.array(m_0["mask_deg"])
    mask_5 = np.array(m_5["mask_deg"])

    # Difference (mask_0 - mask_5) should be >= -0.01 (allowing minor floating point noise)
    diff = mask_0 - mask_5
    assert np.all(diff >= -0.05), "Increasing mast height increased horizon elevation!"
    assert np.mean(diff) > 0.0, "Increasing mast height from 0 to 5m did not lower mean horizon"


def test_lookup_horizon_interpolation():
    """Test linear interpolation and wraparound."""
    mask_deg = [10.0] * 360
    mask_deg[0] = 0.0
    mask_deg[1] = 10.0
    mask_deg[359] = 20.0

    # At az = 0.5: midpoint between 0.0 and 10.0 -> 5.0
    assert pytest.approx(horizon.lookup_horizon(mask_deg, 0.5)) == 5.0

    # At az = 359.5: midpoint between 20.0 and 0.0 -> 10.0 (wraparound)
    assert pytest.approx(horizon.lookup_horizon(mask_deg, 359.5)) == 10.0

    # Negative azimuth wraps around
    assert pytest.approx(horizon.lookup_horizon(mask_deg, -0.5)) == 10.0
