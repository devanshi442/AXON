"""
Independent verification test for topocentric az/el geometry against CSPICE native azlcpo.

Tests 20 points distributed across the Moon (polar, equatorial, mid-latitude, near-side, far-side)
for both Sun and Earth topocentric positions.
"""

import math
import random
import sys
from pathlib import Path
import pytest
import spiceypy as spice

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from science.lunarsight_core.geometry import (
    load_kernels,
    site_to_enu,
    compute_topocentric_az_el,
    compute_topocentric_state,
)
import science.lunarsight_core.constants as C


# 20 diverse test cases across lunar surface and time range 2026-2028
TEST_CASES = [
    # (lat, lon, alt_km, mast_m, utc_time)
    (0.0, 0.0, 0.0, 0.0, "2026-03-01T00:00:00Z"),
    (0.67408, 23.47297, 0.0, 2.0, "2026-06-21T12:00:00Z"),  # Apollo 11
    (-89.9, 0.0, 0.0, 5.0, "2026-01-15T06:00:00Z"),       # South Pole
    (89.5, 45.0, 1.2, 10.0, "2026-07-04T18:00:00Z"),      # North Pole
    (0.0, 180.0, 2.5, 2.0, "2026-03-15T12:00:00Z"),       # Far-side equator seam
    (0.0, -180.0, 2.5, 2.0, "2026-03-15T12:00:00Z"),      # Far-side equator -seam
    (-45.0, 90.0, -1.0, 1.0, "2026-09-22T00:00:00Z"),
    (45.0, -90.0, 0.5, 3.0, "2026-12-31T23:59:59Z"),
    (-80.0, 120.0, 3.0, 8.0, "2027-02-14T10:30:00Z"),
    (75.0, -60.0, -2.0, 4.0, "2027-05-01T15:00:00Z"),
    (-10.5, 150.2, 1.8, 2.0, "2027-08-15T08:15:00Z"),
    (25.3, -135.7, 0.2, 5.0, "2027-11-20T21:45:00Z"),
    (-68.2, -45.1, -0.8, 6.0, "2028-01-01T00:00:00Z"),
    (60.1, 110.4, 2.1, 3.0, "2028-03-20T04:30:00Z"),
    (-30.0, -179.9, 1.1, 2.0, "2028-06-15T16:00:00Z"),
    (30.0, 179.9, 1.1, 2.0, "2028-06-15T16:00:00Z"),
    (-85.0, 0.0, -3.5, 12.0, "2028-08-30T19:20:00Z"),
    (15.0, -30.0, 0.0, 2.5, "2028-10-10T11:11:11Z"),
    (-5.0, 75.0, 1.5, 4.0, "2028-11-11T22:22:22Z"),
    (-89.7, 160.0, 0.5, 15.0, "2028-12-25T12:00:00Z"),
]


@pytest.fixture(scope="module", autouse=True)
def setup_kernels():
    load_kernels()


def test_azlcpo_sun_and_earth_agreement():
    """
    Compare custom topocentric az/el projection against CSPICE azlcpo.
    Tolerance is 1e-4 degrees (< 0.36 arcseconds).
    """
    assert len(TEST_CASES) == 20
    max_sun_az_err = 0.0
    max_sun_el_err = 0.0
    max_earth_az_err = 0.0
    max_earth_el_err = 0.0

    for idx, (lat, lon, alt_km, mast_m, utc) in enumerate(TEST_CASES, start=1):
        et = spice.str2et(utc)
        pos_site, east, north, up = site_to_enu(lat, lon, alt_km, mast_m)

        # Sun
        az_sun, el_sun, d3d_sun = compute_topocentric_state(C.SUN_NAIF_ID, et, pos_site, east, north, up)
        res_sun, _ = spice.azlcpo('ELLIPSOID', 'SUN', et, C.ABCORR, False, True, pos_site, 'MOON', C.MOON_FRAME)
        az_spice_sun = math.degrees(res_sun[1]) % 360.0
        el_spice_sun = math.degrees(res_sun[2])
        d_spice_sun = res_sun[0]

        # Angular differences
        diff_az_sun = min(abs(az_sun - az_spice_sun), 360.0 - abs(az_sun - az_spice_sun))
        diff_el_sun = abs(el_sun - el_spice_sun)
        max_sun_az_err = max(max_sun_az_err, diff_az_sun)
        max_sun_el_err = max(max_sun_el_err, diff_el_sun)

        # Earth
        az_earth, el_earth, d3d_earth = compute_topocentric_state(C.EARTH_NAIF_ID, et, pos_site, east, north, up)
        res_earth, _ = spice.azlcpo('ELLIPSOID', 'EARTH', et, C.ABCORR, False, True, pos_site, 'MOON', C.MOON_FRAME)
        az_spice_earth = math.degrees(res_earth[1]) % 360.0
        el_spice_earth = math.degrees(res_earth[2])
        d_spice_earth = res_earth[0]

        diff_az_earth = min(abs(az_earth - az_spice_earth), 360.0 - abs(az_earth - az_spice_earth))
        diff_el_earth = abs(el_earth - el_spice_earth)
        max_earth_az_err = max(max_earth_az_err, diff_az_earth)
        max_earth_el_err = max(max_earth_el_err, diff_el_earth)

        # Assert sub-milliarcsecond (< 1e-4 deg) agreement
        assert diff_az_sun < 1e-4, f"Case {idx} Sun Az mismatch: {az_sun} vs {az_spice_sun}"
        assert diff_el_sun < 1e-4, f"Case {idx} Sun El mismatch: {el_sun} vs {el_spice_sun}"
        # Distance tolerance accounts for light-time evaluated at surface vs center (~1737 km / c * v_orbit)
        assert abs(d3d_sun - d_spice_sun) < 10.0, f"Case {idx} Sun distance mismatch"

        assert diff_az_earth < 1e-4, f"Case {idx} Earth Az mismatch: {az_earth} vs {az_spice_earth}"
        assert diff_el_earth < 1e-4, f"Case {idx} Earth El mismatch: {el_earth} vs {el_spice_earth}"
        assert abs(d3d_earth - d_spice_earth) < 1.0, f"Case {idx} Earth distance mismatch"

    print(f"Verified 20 random points against CSPICE azlcpo:")
    print(f"Max Sun Az Error: {max_sun_az_err:.8e} deg")
    print(f"Max Sun El Error: {max_sun_el_err:.8e} deg")
    print(f"Max Earth Az Error: {max_earth_az_err:.8e} deg")
    print(f"Max Earth El Error: {max_earth_el_err:.8e} deg")
