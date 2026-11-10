"""
test_time_intervals.py — Regression tests for time duration, sample boundaries,
and energy integration accuracy across 24h, 48h, and irregular intervals.
"""

import datetime
import math
import numpy as np
import pytest

from lunarsight_core import constants as C
from lunarsight_core import geometry as G
from lunarsight_core import metrics as M
from lunarsight_core import power as P


def test_48_hour_interval_sample_counts_vs_elapsed_time():
    """
    Verify that an inclusive 48-hour time series (49 hourly sample points)
    reports exactly 48.0 total period hours, NOT 49.0 hours.
    """
    start_utc = "2026-01-01T00:00:00Z"
    stop_utc = "2026-01-03T00:00:00Z"
    step_s = 3600

    # 49 hourly timestamps from 00:00 to 48:00
    times = [
        (datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc) + datetime.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for h in range(49)
    ]
    assert len(times) == 49
    assert times[0] == start_utc
    assert times[-1] == stop_utc

    # Always illuminated test
    ts = {
        "start_utc": start_utc,
        "stop_utc": stop_utc,
        "step_seconds": step_s,
        "times": times,
        "sun_elevation_deg": [10.0] * 49,
        "sun_azimuth_deg": [float(h * 15 % 360) for h in range(49)],
        "earth_elevation_deg": [15.0] * 49,
        "earth_azimuth_deg": [0.0] * 49,
    }

    res = M.compute_comprehensive_metrics(ts)

    # 1. Period duration
    assert res["total_period_hours"] == 48.0, f"Expected 48.0h total period, got {res['total_period_hours']}"

    # 2. Sun metrics
    assert res["sun"]["total_hours"] == 48.0, f"Expected 48.0h sun, got {res['sun']['total_hours']}"
    assert res["sun"]["percentage"] == 100.0, f"Expected 100.0%, got {res['sun']['percentage']}"
    assert res["sun"]["longest_window_hours"] == 48.0
    assert res["sun"]["longest_dark_gap_hours"] == 0.0

    # 3. Earth metrics
    assert res["earth"]["total_hours"] == 48.0
    assert res["earth"]["percentage"] == 100.0

    # 4. Joint metrics
    assert res["joint"]["total_hours"] == 48.0
    assert res["joint"]["percentage"] == 100.0


def test_24_hour_interval_sample_counts_vs_elapsed_time():
    """Verify that an inclusive 24-hour time series reports exactly 24.0 hours."""
    start_utc = "2026-06-01T00:00:00Z"
    stop_utc = "2026-06-02T00:00:00Z"
    step_s = 3600

    times = [
        (datetime.datetime(2026, 6, 1, tzinfo=datetime.timezone.utc) + datetime.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for h in range(25)
    ]
    assert len(times) == 25

    ts = {
        "start_utc": start_utc,
        "stop_utc": stop_utc,
        "step_seconds": step_s,
        "times": times,
        "sun_elevation_deg": [5.0] * 25,
        "sun_azimuth_deg": [0.0] * 25,
        "earth_elevation_deg": [-10.0] * 25,  # Earth invisible
        "earth_azimuth_deg": [0.0] * 25,
    }

    res = M.compute_comprehensive_metrics(ts)
    assert res["total_period_hours"] == 24.0
    assert res["sun"]["total_hours"] == 24.0
    assert res["sun"]["percentage"] == 100.0
    assert res["earth"]["total_hours"] == 0.0
    assert res["earth"]["percentage"] == 0.0
    assert res["joint"]["total_hours"] == 0.0


def test_irregular_duration_interval():
    """Verify arbitrary 36-hour and 12.5-hour intervals with non-standard bounds."""
    # 36 hours with 37 hourly samples
    start_utc = "2026-03-10T12:00:00Z"
    stop_utc = "2026-03-12T00:00:00Z"
    times_36 = [
        (datetime.datetime(2026, 3, 10, 12, tzinfo=datetime.timezone.utc) + datetime.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for h in range(37)
    ]
    assert len(times_36) == 37

    ts_36 = {
        "start_utc": start_utc,
        "stop_utc": stop_utc,
        "step_seconds": 3600,
        "times": times_36,
        "sun_elevation_deg": [10.0] * 37,
        "sun_azimuth_deg": [0.0] * 37,
        "earth_elevation_deg": [10.0] * 37,
        "earth_azimuth_deg": [0.0] * 37,
    }
    res_36 = M.compute_comprehensive_metrics(ts_36)
    assert res_36["total_period_hours"] == 36.0
    assert res_36["sun"]["total_hours"] == 36.0

    # 12.5 hours with 60-second steps (751 samples)
    start_dt = datetime.datetime(2026, 4, 1, 0, 0, tzinfo=datetime.timezone.utc)
    times_12_5 = [
        (start_dt + datetime.timedelta(seconds=60 * i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for i in range(751)
    ]
    assert len(times_12_5) == 751
    assert times_12_5[-1] == "2026-04-01T12:30:00Z"

    ts_12_5 = {
        "start_utc": "2026-04-01T00:00:00Z",
        "stop_utc": "2026-04-01T12:30:00Z",
        "step_seconds": 60,
        "times": times_12_5,
        "sun_elevation_deg": [5.0] * 751,
        "sun_azimuth_deg": [0.0] * 751,
        "earth_elevation_deg": [5.0] * 751,
        "earth_azimuth_deg": [0.0] * 751,
    }
    res_12_5 = M.compute_comprehensive_metrics(ts_12_5)
    assert res_12_5["total_period_hours"] == 12.5
    assert res_12_5["sun"]["total_hours"] == 12.5
    assert res_12_5["sun"]["percentage"] == 100.0


def test_darkness_duration_bounded_by_period():
    """Verify that a 48-hour period with complete darkness reports longest dark gap of 48.0h, not 49.0h."""
    start_utc = "2026-01-01T00:00:00Z"
    stop_utc = "2026-01-03T00:00:00Z"
    times = [
        (datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc) + datetime.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for h in range(49)
    ]

    ts = {
        "start_utc": start_utc,
        "stop_utc": stop_utc,
        "step_seconds": 3600,
        "times": times,
        "sun_elevation_deg": [-10.0] * 49,
        "sun_azimuth_deg": [0.0] * 49,
        "earth_elevation_deg": [-10.0] * 49,
        "earth_azimuth_deg": [0.0] * 49,
    }

    res = M.compute_comprehensive_metrics(ts)
    assert res["total_period_hours"] == 48.0
    assert res["sun"]["total_hours"] == 0.0
    assert res["sun"]["percentage"] == 0.0
    assert res["sun"]["longest_dark_gap_hours"] == 48.0


def test_solar_energy_trapezoidal_integration():
    """
    Verify that constant power over a 48-hour period integrates to P * 48 Wh,
    preventing 1-hour over-integration from discrete endpoint inclusion.
    """
    step_s = 3600
    n_points = 49  # 48 hours at 1-hour steps
    sun_el = [30.0] * n_points
    sun_az = [45.0] * n_points
    sun_fraction = [1.0] * n_points
    area_m2 = 2.0
    efficiency = 0.30

    res = P.compute_solar_power(
        sun_el_deg=sun_el,
        sun_az_deg=sun_az,
        sun_fraction=sun_fraction,
        area_m2=area_m2,
        efficiency=efficiency,
        orientation="horizontal",
        step_seconds=step_s,
    )

    # For horizontal array with el=30 deg: cos(i) = sin(30) = 0.5
    # Power = 1361.0 * 0.30 * 0.5 * 1.0 * 2.0 = 408.3 Watts
    expected_power = C.SOLAR_IRRADIANCE_W_M2 * efficiency * 0.5 * 1.0 * area_m2
    assert math.isclose(res["peak_power_watts"], expected_power, rel_tol=1e-3)
    assert math.isclose(res["mean_power_watts"], expected_power, rel_tol=1e-3)

    # Over 48 elapsed hours, Energy = Power * 48.0 Wh
    expected_energy_wh = expected_power * 48.0
    assert math.isclose(res["total_energy_wh"], expected_energy_wh, rel_tol=1e-3)
    # Specific energy = expected_energy / area
    assert math.isclose(res["specific_energy_wh_m2"], expected_energy_wh / area_m2, rel_tol=1e-3)


def test_48_hour_strict_equality_flat_window_accounting():
    """
    Strict-equality test for 48-hour flat horizon case (-89.534, -150.052, 2026-03-01..03, 1h step).
    Asserts:
    1. For every window, duration_hours == (end - start) exactly.
    2. percentage == (total_hours / total_period_hours) * 100 exactly.
    3. Flat Earth duration == 41.0h, Earth percentage == 85.4%.
    4. Flat Sun duration == 0.0h, Sun percentage == 0.0%.
    """
    import sys
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent.parent
    if str(root / "api") not in sys.path:
        sys.path.insert(0, str(root / "api"))
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    from api.services.analysis_service import analysis_service
    analysis_service.load_kernels()

    res = analysis_service.analyze_site(
        lat=-89.534,
        lon=-150.052,
        start_utc="2026-03-01T00:00:00Z",
        stop_utc="2026-03-03T00:00:00Z",
        step_seconds=3600,
        mast_height_m=2.0,
        horizon_mode="flat",
    )
    m = res["flat"]
    total_period = m["total_period_hours"]
    assert total_period == 48.0

    for domain in ["sun", "earth", "joint"]:
        d_meta = m[domain]
        total_h = d_meta["total_hours"]
        pct = d_meta["percentage"]

        # Assert percentage == (total / period) * 100
        expected_pct = round((total_h / total_period) * 100.0, 1)
        assert pct == expected_pct, f"{domain} percentage mismatch: {pct} != {expected_pct}"

        # Assert every window satisfies duration_hours == (end - start) exactly
        for w in d_meta["windows"]:
            dt_s = datetime.datetime.fromisoformat(w["start"].replace("Z", "+00:00"))
            dt_e = datetime.datetime.fromisoformat(w["end"].replace("Z", "+00:00"))
            exact_diff = (dt_e - dt_s).total_seconds() / 3600.0
            assert w["duration_hours"] == exact_diff, f"Window {w} fails duration == (end - start)"

    # Specific 48h physical flat results (Earth dips below 0° tangent for 7h)
    assert m["earth"]["total_hours"] == 41.0
    assert m["earth"]["percentage"] == 85.4
    assert m["sun"]["total_hours"] == 0.0
    assert m["sun"]["percentage"] == 0.0
    assert m["joint"]["total_hours"] == 0.0
    assert m["joint"]["percentage"] == 0.0


@pytest.mark.needs_dems
def test_48_hour_strict_equality_window_accounting():
    """
    Strict-equality test for 48-hour case (-89.534, -150.052, 2026-03-01..03, 1h step).
    Asserts:
    1. For every window, duration_hours == (end - start) exactly.
    2. percentage == (total_hours / total_period_hours) * 100 exactly.
    3. Sun duration == 38.0h (not 39h), Sun percentage == 79.2%.
    4. Earth duration == 48.0h, Earth percentage == 100.0%.
    """
    import sys
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent.parent
    if str(root / "api") not in sys.path:
        sys.path.insert(0, str(root / "api"))
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    from api.services.analysis_service import analysis_service
    analysis_service.load_kernels()

    res = analysis_service.analyze_site(
        lat=-89.534,
        lon=-150.052,
        start_utc="2026-03-01T00:00:00Z",
        stop_utc="2026-03-03T00:00:00Z",
        step_seconds=3600,
        mast_height_m=2.0,
        horizon_mode="terrain",
    )
    assert res.get("terrain") is not None, "Connecting Ridge polar DEM required for terrain window accounting"
    m = res["terrain"]
    total_period = m["total_period_hours"]
    assert total_period == 48.0

    for domain in ["sun", "earth", "joint"]:
        d_meta = m[domain]
        total_h = d_meta["total_hours"]
        pct = d_meta["percentage"]

        # Assert percentage == (total / period) * 100
        expected_pct = round((total_h / total_period) * 100.0, 1)
        assert pct == expected_pct, f"{domain} percentage mismatch: {pct} != {expected_pct}"

        # Assert every window satisfies duration_hours == (end - start) exactly
        for w in d_meta["windows"]:
            dt_s = datetime.datetime.fromisoformat(w["start"].replace("Z", "+00:00"))
            dt_e = datetime.datetime.fromisoformat(w["end"].replace("Z", "+00:00"))
            exact_diff = (dt_e - dt_s).total_seconds() / 3600.0
            assert w["duration_hours"] == exact_diff, f"Window {w} fails duration == (end - start)"

    # Specific 48h physical results
    assert m["earth"]["total_hours"] == 48.0
    assert m["earth"]["percentage"] == 100.0
    assert m["sun"]["total_hours"] == 38.0
    assert m["sun"]["percentage"] == 79.2
    assert m["joint"]["total_hours"] == 38.0
    assert m["joint"]["percentage"] == 79.2


