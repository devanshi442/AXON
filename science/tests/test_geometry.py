"""
test_geometry.py — Unit and regression tests for lunarsight_core.geometry.
Includes offline Horizons golden-fixture comparisons and far-side physics tests.
"""

import json
from pathlib import Path
import pytest
from lunarsight_core import constants as C
from lunarsight_core import geometry as G


def test_site_bounds_validation():
    with pytest.raises(ValueError):
        G.site_to_enu(95.0, 0.0)
    with pytest.raises(ValueError):
        G.site_to_enu(0.0, 190.0)


def test_site_to_enu_vectors():
    # Site at (0, 0)
    pos, east, north, up = G.site_to_enu(0.0, 0.0)
    assert pytest.approx(pos[0]) == C.MOON_RADIUS_KM
    assert pytest.approx(pos[1]) == 0.0
    assert pytest.approx(pos[2]) == 0.0

    assert pytest.approx(up) == [1.0, 0.0, 0.0]
    assert pytest.approx(east) == [0.0, 1.0, 0.0]
    assert pytest.approx(north) == [0.0, 0.0, 1.0]


def test_intervals_extraction():
    times = [f"2026-01-01T{h:02d}:00:00Z" for h in range(10)]
    mask = [False, True, True, True, False, False, True, True, False, False]
    intervals = G.find_intervals(times, mask, step_seconds=3600)
    assert len(intervals) == 2
    assert intervals[0]["start"] == "2026-01-01T01:00:00Z"
    assert intervals[0]["end"] == "2026-01-01T03:00:00Z"
    assert intervals[0]["duration_hours"] == 3.0
    assert intervals[1]["start"] == "2026-01-01T06:00:00Z"
    assert intervals[1]["end"] == "2026-01-01T07:00:00Z"
    assert intervals[1]["duration_hours"] == 2.0


@pytest.mark.needs_kernels
def test_horizons_golden_im1(kernels_dir):
    G.load_kernels(kernels_dir)
    try:
        # Check against im-1 fixture at 2024-02-22T00:00:00
        # Lat: -80.13, Lon: 1.44
        pos, east, north, up = G.site_to_enu(-80.13, 1.44)
        et = G.spice.str2et("2024-02-22T00:00:00")
        
        sun_az, sun_el = G.compute_topocentric_az_el(C.SUN_NAIF_ID, et, pos, east, north, up)
        earth_az, earth_el = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et, pos, east, north, up)

        # Horizons golden fixture values:
        # Sun: Azi=30.596680, Elev=9.645688
        # Earth: Azi=2.694507, Elev=15.985857
        assert abs(sun_az - 30.596680) < 0.05
        assert abs(sun_el - 9.645688) < 0.05
        assert abs(earth_az - 2.694507) < 0.05
        assert abs(earth_el - 15.985857) < 0.05
    finally:
        G.unload_kernels()


@pytest.mark.needs_kernels
def test_farside_earth_invisible(kernels_dir):
    """
    Far-side test: on the lunar far side (e.g., lat=0, lon=180),
    Earth must never be above the local idealized horizon (elevation < 0).
    """
    G.load_kernels(kernels_dir)
    try:
        pos, east, north, up = G.site_to_enu(0.0, 180.0)
        # Check across multiple dates in 2026
        times = ["2026-01-01T00:00:00", "2026-04-01T00:00:00", "2026-07-01T00:00:00", "2026-10-01T00:00:00"]
        for t in times:
            et = G.spice.str2et(t)
            _, earth_el = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et, pos, east, north, up)
            assert earth_el < -50.0, f"Earth unexpectedly visible from far side: {earth_el}°"
    finally:
        G.unload_kernels()
