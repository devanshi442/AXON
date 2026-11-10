"""
test_time_bounds.py — Comprehensive tests for time boundaries, step sensitivity,
refined vs hourly window boundaries, UTC format enforcement, and date range limits.
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT))

from main import app
from science.lunarsight_core.geometry import load_kernels, compute_site_timeseries
from science.lunarsight_core.metrics import compute_comprehensive_metrics


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module", autouse=True)
def setup_kernels():
    load_kernels()


def test_refined_vs_hourly_boundary_less_than_one_step():
    """
    Verify that 1-minute SPICE root-finding refinement shifts the event transition
    boundary by strictly less than one discrete sample step (< 3600 seconds).
    """
    start_utc = "2026-03-01T00:00:00Z"
    stop_utc = "2026-03-05T00:00:00Z"

    # Apollo 11
    ts = compute_site_timeseries(0.67408, 23.47297, start_utc, stop_utc, step_seconds=3600)

    # Metrics without refinement
    m_unrefined = compute_comprehensive_metrics(
        ts,
        refine_edges=False,
    )

    # Metrics with SPICE root refinement
    m_refined = compute_comprehensive_metrics(
        ts,
        refine_edges=True,
        site_lat=0.67408,
        site_lon=23.47297,
    )

    unrefined_windows = m_unrefined["sun"]["windows"]
    refined_windows = m_refined["sun"]["windows"]

    assert len(unrefined_windows) == len(refined_windows), "Window counts must match"

    for w_unref, w_ref in zip(unrefined_windows, refined_windows):
        dur_diff_hours = abs(w_ref["duration_hours"] - w_unref["duration_hours"])
        print(f"Window unrefined duration: {w_unref['duration_hours']}h, refined: {w_ref['duration_hours']}h, diff={dur_diff_hours:.3f}h")
        assert dur_diff_hours < 1.0, f"Refinement shifted duration by >= 1 step ({dur_diff_hours:.3f}h)"


def test_step_sensitivity():
    """
    Evaluate same 24-hour interval at 3 different step sizes: 3600s, 600s, 60s.
    Sunlight hours should converge and differ by at most the coarse step size.
    """
    start = "2026-03-01T00:00:00Z"
    stop = "2026-03-02T00:00:00Z"

    ts_3600 = compute_site_timeseries(0.67408, 23.47297, start, stop, step_seconds=3600)
    ts_600 = compute_site_timeseries(0.67408, 23.47297, start, stop, step_seconds=600)
    ts_60 = compute_site_timeseries(0.67408, 23.47297, start, stop, step_seconds=60)

    m_3600 = compute_comprehensive_metrics(ts_3600)
    m_600 = compute_comprehensive_metrics(ts_600)
    m_60 = compute_comprehensive_metrics(ts_60)

    h_3600 = m_3600["sun"]["total_hours"]
    h_600 = m_600["sun"]["total_hours"]
    h_60 = m_60["sun"]["total_hours"]

    print(f"Sunlight duration at step=3600s: {h_3600}h, step=600s: {h_600}h, step=60s: {h_60}h")
    # All 3 should be within 1 hour of each other
    assert abs(h_3600 - h_60) <= 1.0
    assert abs(h_600 - h_60) <= 0.2


def test_api_date_validation_rejects_malformed_and_chronology(client):
    """
    Verify API input validation for date strings:
    - Malformed string -> 400
    - Stop before start -> 400
    - Range exceeding 90 days -> 400
    """
    # Malformed start date
    resp = client.post("/api/site/analyze", json={
        "lat": 0.0, "lon": 0.0, "start_utc": "invalid-date", "stop_utc": "2026-03-02T00:00:00Z"
    })
    assert resp.status_code == 400, f"Expected 400 for malformed date, got {resp.status_code}"

    # Stop before start
    resp2 = client.post("/api/site/analyze", json={
        "lat": 0.0, "lon": 0.0, "start_utc": "2026-03-05T00:00:00Z", "stop_utc": "2026-03-01T00:00:00Z"
    })
    assert resp2.status_code == 400, f"Expected 400 for reversed dates, got {resp2.status_code}"

    # Date range > 90 days
    resp3 = client.post("/api/site/analyze", json={
        "lat": 0.0, "lon": 0.0, "start_utc": "2026-01-01T00:00:00Z", "stop_utc": "2026-05-01T00:00:00Z"
    })
    assert resp3.status_code == 400, f"Expected 400 for range > 90 days, got {resp3.status_code}"
    assert "exceeds maximum allowed 90 days" in resp3.text
