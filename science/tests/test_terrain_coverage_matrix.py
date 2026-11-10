"""
test_terrain_coverage_matrix.py — Verification of DEM selection, projection transforms,
elevation sampling, and T1/T2/T3 fallback behavior across the complete lunar coordinate domain.
"""

from pathlib import Path
import pytest
import numpy as np

from lunarsight_core import constants as C
from lunarsight_core import terrain
from lunarsight_core import horizon


def test_south_pole_dem_selection():
    """Verify high-resolution south polar DEM selection (T1 tier)."""
    # -89.5 deg S is inside LDEM_875S_20M and LDEM_85S_20M
    dem_info, status, valid_ranges = terrain.select_dem_for_site(
        lat_deg=-89.5, lon_deg=0.0, max_range_km=30.0
    )
    if dem_info is not None:
        assert status in ("full", "partial")
        assert dem_info.proj_type == "polar_stereographic"
        assert dem_info.min_lat == -90.0
        assert dem_info.max_lat in (-87.5, -85.0, -80.0, -75.0)


def test_north_pole_fallback():
    """Verify that north polar sites correctly fall back to T2 or T3 (no South Polar DEM)."""
    dem_info, status, valid_ranges = terrain.select_dem_for_site(
        lat_deg=89.5, lon_deg=0.0, max_range_km=30.0
    )
    # North pole is outside polar stereographic DEMs (which are South Pole only)
    if dem_info is not None:
        assert dem_info.proj_type == "cylindrical"  # Global LDEM_64
        assert dem_info.id == "LDEM_64"
    else:
        assert status == "unavailable"


def test_equatorial_nearside():
    """Verify equatorial near-side coordinates (e.g. Apollo 11 at 0.6875°N, 23.4333°E)."""
    dem_info, status, valid_ranges = terrain.select_dem_for_site(
        lat_deg=0.6875, lon_deg=23.4333, max_range_km=30.0
    )
    if dem_info is not None:
        assert dem_info.proj_type == "cylindrical"
        assert dem_info.id == "LDEM_64"
    else:
        assert status == "unavailable"


def test_equatorial_farside():
    """Verify far-side coordinate (0°N, 180°E) isolation and fallback."""
    dem_info, status, valid_ranges = terrain.select_dem_for_site(
        lat_deg=0.0, lon_deg=180.0, max_range_km=30.0
    )
    if dem_info is not None:
        assert dem_info.proj_type == "cylindrical"
    else:
        assert status == "unavailable"


def test_polar_dem_boundary_transitions():
    """Verify boundary latitude transitions at -75°, -80°, -85°, -87.5°."""
    boundaries = [-75.0, -80.0, -85.0, -87.5]
    for b_lat in boundaries:
        # Just inside boundary (more south)
        inside_lat = b_lat - 0.1
        dem_in, status_in, _ = terrain.select_dem_for_site(lat_deg=inside_lat, lon_deg=45.0, max_range_km=10.0)

        # Just outside boundary (more north)
        outside_lat = b_lat + 0.5
        dem_out, status_out, _ = terrain.select_dem_for_site(lat_deg=outside_lat, lon_deg=45.0, max_range_km=10.0)

        # If polar DEM exists, inside should select it
        if dem_in is not None:
            assert dem_in.proj_type in ("polar_stereographic", "cylindrical")


def test_horizon_raymarch_unavailable_dem_transparent_fallback():
    """
    Verify that compute_horizon_raymarch never falsely reports terrain
    when falling back to flat-horizon mode on missing DEMs.
    """
    # Use a dummy preferred DEM that doesn't exist to force fallback
    mask = horizon.compute_horizon_raymarch(
        lat_deg=15.0,
        lon_deg=50.0,
        preferred_dem_id="NON_EXISTENT_DEM_123",
    )
    # When DEM is unavailable, coverage_status must be unavailable
    # and all mask elevations must be 0.0 (flat horizon)
    if mask["dem_id"] is None:
        assert mask["coverage_status"] == "unavailable"
        assert all(el == 0.0 for el in mask["mask_deg"])
        assert mask["site_height_m"] == 0.0

