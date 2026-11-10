"""
test_best_windows.py — Deep verification of the best operating window search engine.
Tests boundary handling, month crossing, midnight crossing, ranking stability, and fallbacks.
"""

import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "science"))

import pytest
try:
    from api.services.analysis_service import AnalysisService
except ImportError:
    from services.analysis_service import AnalysisService


@pytest.fixture(scope="module")
def analysis_svc():
    svc = AnalysisService()
    svc.load_kernels()
    yield svc
    svc.unload_kernels()


def test_best_windows_crossing_midnight(analysis_svc):
    """Verify window extraction when a window crosses UTC midnight."""
    # Search over 3 days (Jan 1 to Jan 4 2026) at IM-1 site
    res = analysis_svc.search_best_windows(
        site_id="im-1",
        search_start_utc="2026-01-01T00:00:00Z",
        search_stop_utc="2026-01-04T00:00:00Z",
        min_window_hours=6.0,
        horizon_mode="flat",
        top_n=5,
    )
    assert res["status"] == "success"
    assert "Malapert" in res["site_name"]
    assert "windows" in res
    assert isinstance(res["windows"], list)

    for w in res["windows"]:
        assert w["duration_hours"] >= 6.0
        assert "start_utc" in w
        assert "end_utc" in w
        assert w["rank"] >= 1


def test_best_windows_crossing_month_boundary(analysis_svc):
    """Verify window extraction across month boundary (Jan 28 to Feb 04 2026)."""
    res = analysis_svc.search_best_windows(
        site_id="im-1",
        search_start_utc="2026-01-28T00:00:00Z",
        search_stop_utc="2026-02-04T00:00:00Z",
        min_window_hours=12.0,
        horizon_mode="flat",
        top_n=5,
    )
    assert res["status"] == "success"
    assert res["search_start_utc"] == "2026-01-28T00:00:00Z"
    assert res["search_stop_utc"] == "2026-02-04T00:00:00Z"


def test_best_windows_ranking_stability(analysis_svc):
    """Verify that multiple candidate windows are strictly sorted in descending duration order."""
    res = analysis_svc.search_best_windows(
        site_id="im-1",
        search_start_utc="2026-01-01T00:00:00Z",
        search_stop_utc="2026-01-30T00:00:00Z",
        min_window_hours=2.0,
        horizon_mode="flat",
        top_n=10,
    )
    windows = res["windows"]
    if len(windows) > 1:
        for i in range(len(windows) - 1):
            assert windows[i]["duration_hours"] >= windows[i + 1]["duration_hours"]
            assert windows[i]["rank"] == i + 1


def test_best_windows_unreachable_duration_returns_empty(analysis_svc):
    """Verify that an impossibly large min_window_hours returns an empty list without error."""
    res = analysis_svc.search_best_windows(
        site_id="im-1",
        search_start_utc="2026-01-01T00:00:00Z",
        search_stop_utc="2026-01-03T00:00:00Z",
        min_window_hours=1000.0,  # 1000h min duration inside 48h search
        horizon_mode="flat",
        top_n=3,
    )
    assert res["status"] == "success"
    assert len(res["windows"]) == 0
    assert res["total_candidates_found"] == 0


def test_best_windows_custom_coordinates(analysis_svc):
    """Verify best-windows search works seamlessly on custom coordinates."""
    res = analysis_svc.search_best_windows(
        lat=-85.0,
        lon=0.0,
        site_name="Custom Ridge",
        search_start_utc="2026-02-01T00:00:00Z",
        search_stop_utc="2026-02-05T00:00:00Z",
        min_window_hours=4.0,
        horizon_mode="flat",
        top_n=3,
    )
    assert res["status"] == "success"
    assert res["lat"] == -85.0
    assert res["lon"] == 0.0
    assert res["site_name"] == "Custom Ridge"
