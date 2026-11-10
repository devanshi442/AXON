"""
test_horizon_sanity.py — Scientific sanity tests for 3D terrain horizon computation:
1. Deep crater floor obstruction and permanent shadow.
2. High peak / ridge horizon dip.
3. Ray-march range sensitivity (25 km, 50 km, 75 km monotonicity).
4. Step size sensitivity and convergence.
"""

import math
import sys
from pathlib import Path
import pytest
import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))

from science.lunarsight_core.horizon import compute_horizon
from science.lunarsight_core.geometry import load_kernels, compute_site_timeseries
from science.lunarsight_core.visibility import compute_sun_visibility

pytestmark = pytest.mark.needs_dems


@pytest.fixture(scope="module", autouse=True)
def setup_kernels():
    load_kernels()


def test_crater_floor_permanent_shadow():
    """
    Shackleton crater floor (lat -89.63, lon 120.5) is surrounded by steep 3-4 km crater walls.
    1. The computed horizon mask must have substantial elevation across 360° (min mask > 15°).
    2. Since the Sun's maximum elevation at the South Pole is <= 1.54°,
       the terrain-obstructed sunlight must be strictly 0.0% over an entire year!
    """
    mask_floor = compute_horizon(-89.63, 120.5, az_step_deg=15.0, observer_height_m=2.0, max_range_km=25.0)
    assert mask_floor is not None
    mask_deg = np.array(mask_floor["mask_deg"])
    print(f"Shackleton crater floor horizon mask: min={np.min(mask_deg):.2f}°, max={np.max(mask_deg):.2f}°, mean={np.mean(mask_deg):.2f}°")

    # Crater floor must see rim walls rising well above the polar sun (min > 15°)
    assert np.min(mask_deg) > 15.0, f"Expected all horizon angles > 15.0°, got min {np.min(mask_deg)}"
    assert np.mean(mask_deg) > 20.0, f"Expected mean horizon > 20.0°, got {np.mean(mask_deg)}"

    # Check sunlight over a full lunar year (365 days)
    ts = compute_site_timeseries(-89.63, 120.5, "2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z", step_seconds=86400)
    sun_vis = compute_sun_visibility(ts["sun_elevation_deg"], ts["sun_azimuth_deg"], mask=mask_floor)
    sun_fraction = np.array(sun_vis["fraction"])
    visible_count = np.sum(sun_fraction > 0.0)

    print(f"Crater floor visible samples over year: {visible_count} / {len(sun_fraction)}")
    assert visible_count == 0, "Crater floor should have 0% sunlight across the entire year (Permanently Shadowed Region)"


def test_high_peak_horizon_negative_dip():
    """
    On a high summit (such as Malapert Mountain or high rim peak at -86.0° S, 0.0° E)
    with a 20m mast, the observer looks down across lower plains.
    Along at least some azimuths facing downhill, the horizon angle should be depressed
    (negative or near zero, well below local flat horizontal plane due to lunar curvature and drop).
    """
    mask_peak = compute_horizon(-86.0, 0.0, az_step_deg=10.0, observer_height_m=20.0, max_range_km=50.0)
    assert mask_peak is not None
    mask_deg = np.array(mask_peak["mask_deg"])
    print(f"High peak horizon mask: min={np.min(mask_deg):.2f}°, max={np.max(mask_deg):.2f}°")
    # Due to downward slope and lunar curvature, min horizon should be <= 0.0°
    assert np.min(mask_deg) <= 0.5, f"Expected low/negative horizon dip, got min {np.min(mask_deg)}"


def test_raymarch_range_monotonicity():
    """
    Ray-marching physics invariant:
    Extending the search range from 25 km to 50 km to 75 km can only discover
    additional terrain obstacles at greater distances; it can never remove obstacles.
    Therefore, for every azimuth:
        mask(75 km) >= mask(50 km) >= mask(25 km) (within numerical precision).
    """
    lat, lon = -89.9, 0.0  # Shackleton rim
    m25 = compute_horizon(lat, lon, az_step_deg=15.0, max_range_km=25.0)
    m50 = compute_horizon(lat, lon, az_step_deg=15.0, max_range_km=50.0)
    m75 = compute_horizon(lat, lon, az_step_deg=15.0, max_range_km=75.0)

    h25 = np.array(m25["mask_deg"])
    h50 = np.array(m50["mask_deg"])
    h75 = np.array(m75["mask_deg"])

    # Monotonicity test
    diff_50_25 = h50 - h25
    diff_75_50 = h75 - h50

    print(f"Max obstacle elevation gained (25km -> 50km): {np.max(diff_50_25):.2f}°")
    print(f"Max obstacle elevation gained (50km -> 75km): {np.max(diff_75_50):.2f}°")

    # Any negative difference must be <= numerical precision noise (0.01°)
    assert np.all(diff_50_25 >= -0.01), f"50km range dropped below 25km range: min diff {np.min(diff_50_25)}"
    assert np.all(diff_75_50 >= -0.01), f"75km range dropped below 50km range: min diff {np.min(diff_75_50)}"
