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


def test_compute_opportunities_basic():
    """compute_opportunities should produce correct totals, dark gap, and longest window."""
    # Synthesize a 10-hour time series (hourly):
    # Sun above threshold for hours 1-3 (3 h) and 7-8 (2 h); earth always above.
    times = [f"2026-01-01T{h:02d}:00:00Z" for h in range(10)]
    # threshold = 5.0; use elevation > 5 to be clearly above
    # Sun elevations: 0h=-1, 1h=10, 2h=10, 3h=10, 4h=-1, 5h=-1, 6h=-1, 7h=10, 8h=10, 9h=-1
    sun_el = [-1, 10, 10, 10, -1, -1, -1, 10, 10, -1]
    # Earth always above for simplicity
    earth_el = [10] * 10

    ts = {
        "times": times,
        "sun_elevation_deg": sun_el,
        "earth_elevation_deg": earth_el,
        "step_seconds": 3600,
    }
    result = G.compute_opportunities(ts, threshold_deg=5.0)

    assert result["sun"]["total_hours"] == 5.0   # 3 + 2
    assert result["sun"]["window_count"] == 2
    assert result["sun"]["longest_window_hours"] == 3.0
    # Longest dark gap: 3 consecutive dark hours (4,5,6)
    assert result["sun"]["longest_dark_gap_hours"] == 3.0

    assert result["earth"]["total_hours"] == 10.0
    assert result["earth"]["longest_dark_gap_hours"] == 0.0  # never dark

    # Joint = sun windows (earth always up)
    assert result["joint"]["total_hours"] == result["sun"]["total_hours"]


def test_compute_opportunities_all_dark():
    """All-dark scenario: zero windows, dark gap = full period."""
    times = [f"2026-01-01T{h:02d}:00:00Z" for h in range(24)]
    ts = {
        "times": times,
        "sun_elevation_deg": [-5.0] * 24,
        "earth_elevation_deg": [-5.0] * 24,
        "step_seconds": 3600,
    }
    result = G.compute_opportunities(ts, threshold_deg=0.0)
    # threshold=0.0, but all elevations are -5 so still dark
    assert result["sun"]["total_hours"] == 0.0
    assert result["sun"]["window_count"] == 0
    assert result["sun"]["longest_dark_gap_hours"] == 24.0


def test_compute_opportunities_always_illuminated():
    """Always-illuminated scenario: one window, no dark gap."""
    times = [f"2026-01-01T{h:02d}:00:00Z" for h in range(12)]
    ts = {
        "times": times,
        "sun_elevation_deg": [20.0] * 12,
        "earth_elevation_deg": [20.0] * 12,
        "step_seconds": 3600,
    }
    result = G.compute_opportunities(ts, threshold_deg=5.0)
    assert result["sun"]["total_hours"] == 12.0
    assert result["sun"]["window_count"] == 1
    assert result["sun"]["longest_window_hours"] == 12.0
    assert result["sun"]["longest_dark_gap_hours"] == 0.0


def diff_angle(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def parse_fixture_rows(json_path):
    d = json.loads(Path(json_path).read_text(encoding="utf-8"))
    res = d["result"]
    soe = res.find("$$SOE")
    eoe = res.find("$$EOE")
    segment = res[soe + 5:eoe].strip()
    rows = []
    for line in segment.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        rows.append((parts[0], float(parts[3]), float(parts[4])))
    return rows


@pytest.mark.needs_kernels
@pytest.mark.parametrize("prefix,lat,lon", [
    ("im-1", -80.13, 1.44),
    ("blue-ghost-1", 18.56, 61.81),
    ("im-2", -84.7906, 29.1957),
    ("apollo11", 0.6875, 23.4333),
    ("shackleton-rim", -89.68, 129.0),
    ("farside-0N-180E", 0.0, 180.0),
    ("nearlimb-0N-90E", 0.0, 90.0),
])
def test_horizons_golden_all_fixtures_all_rows(kernels_dir, prefix, lat, lon):
    """
    Parametrized golden benchmark: validates EVERY single row of EVERY Horizons fixture
    (Sun and Earth) against SPICE topocentric coordinates.
    Tolerances: 0.01° for elevation, 0.01° for azimuth (away from polar singularity).
    """
    G.load_kernels(kernels_dir)
    try:
        fixtures_dir = Path("science/fixtures/horizons")
        pos, east, north, up = G.site_to_enu(lat, lon)

        sun_files = [f for f in fixtures_dir.glob(f"{prefix}_sun_*.json") if "_query" not in f.name]
        earth_files = [f for f in fixtures_dir.glob(f"{prefix}_earth_*.json") if "_query" not in f.name]

        assert sun_files, f"Missing sun fixture for {prefix}"
        assert earth_files, f"Missing earth fixture for {prefix}"

        sun_rows = parse_fixture_rows(sun_files[0])
        earth_rows = parse_fixture_rows(earth_files[0])

        assert len(sun_rows) > 0, f"No sun rows for {prefix}"
        assert len(earth_rows) > 0, f"No earth rows for {prefix}"

        for t_str, h_az, h_el in sun_rows:
            et = G.spice.str2et(t_str)
            sp_az, sp_el = G.compute_topocentric_az_el(C.SUN_NAIF_ID, et, pos, east, north, up)
            assert abs(sp_el - h_el) < 0.01, f"Sun El mismatch at {t_str}: SPICE={sp_el}, Horiz={h_el}"
            if abs(sp_el) < 88.0:
                assert diff_angle(sp_az, h_az) < 0.01, f"Sun Az mismatch at {t_str}: SPICE={sp_az}, Horiz={h_az}"

        for t_str, h_az, h_el in earth_rows:
            et = G.spice.str2et(t_str)
            sp_az, sp_el = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et, pos, east, north, up)
            assert abs(sp_el - h_el) < 0.01, f"Earth El mismatch at {t_str}: SPICE={sp_el}, Horiz={h_el}"
            if abs(sp_el) < 88.0:
                assert diff_angle(sp_az, h_az) < 0.01, f"Earth Az mismatch at {t_str}: SPICE={sp_az}, Horiz={h_az}"

    finally:
        G.unload_kernels()


def test_benchmark_artifact_present_and_passed():
    """Verify that the real Horizons benchmark artifact exists and confirms all rows passed within tolerance."""
    root = Path(__file__).resolve().parent.parent.parent
    bench_file = root / "science" / "validation" / "benchmark.json"
    assert bench_file.is_file(), "science/validation/benchmark.json artifact missing"
    data = json.loads(bench_file.read_text(encoding="utf-8"))
    assert data["all_passed"] is True
    assert data["total_rows_tested"] >= 4000
    assert data["overall_max_el_diff_deg"] < 0.01
    assert data["overall_max_az_diff_deg"] < 0.01


@pytest.mark.needs_kernels
def test_farside_earth_invisible(kernels_dir):
    """
    Far-side test: on the lunar far side (e.g., lat=0, lon=180),
    Earth must never be above the local idealized horizon (elevation < 0).
    """
    G.load_kernels(kernels_dir)
    try:
        pos, east, north, up = G.site_to_enu(0.0, 180.0)
        times = ["2026-01-01T00:00:00", "2026-04-01T00:00:00", "2026-07-01T00:00:00", "2026-10-01T00:00:00"]
        for t in times:
            et = G.spice.str2et(t)
            _, earth_el = G.compute_topocentric_az_el(C.EARTH_NAIF_ID, et, pos, east, north, up)
            assert earth_el < -50.0, f"Earth unexpectedly visible from far side: {earth_el}°"
    finally:
        G.unload_kernels()
