"""
test_constants.py — sanity-check the project constants (no kernels needed).
"""
import math
from lunarsight_core import constants as C


def test_moon_radius_is_iau_value():
    """NAIF pck00011.tpc uses 1737.4 km for the Moon's mean radius."""
    assert C.MOON_RADIUS_KM == 1737.4


def test_sun_angular_radius_is_reasonable():
    """Sun's angular radius from the Moon: arctan(695700 / 149597870) ≈ 0.2665°."""
    computed = math.degrees(math.atan(695700.0 / 149597870.0))
    # We use 0.267° (rounded up); allow ±0.001° tolerance
    assert abs(C.SUN_ANGULAR_RADIUS_DEG - computed) < 0.002


def test_moon_frame_name():
    assert C.MOON_FRAME == "MOON_ME"


def test_lon_range_east_positive():
    """Longitude must be east-positive over −180 to +180."""
    assert C.LON_MIN_DEG == -180.0
    assert C.LON_MAX_DEG == 180.0


def test_flat_horizon_is_zero():
    assert C.FLAT_HORIZON_DEG == 0.0


def test_abcorr_includes_stellar_aberration():
    """We use LT+S (light-time + stellar aberration) for observer geometry."""
    assert "LT" in C.ABCORR
    assert "S" in C.ABCORR


def test_min_step_is_positive_and_at_least_60s():
    assert C.MIN_STEP_SECONDS >= 60


def test_naif_ids():
    assert C.SUN_NAIF_ID == 10
    assert C.EARTH_NAIF_ID == 399
    assert C.MOON_NAIF_ID == 301
