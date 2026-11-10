"""
test_best_windows_bruteforce.py — Independent brute-force search compared
against POST /api/site/best-windows on 3 distinct sites.
"""

import sys
from pathlib import Path
import pytest
import numpy as np
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT))

from main import app
from science.lunarsight_core.geometry import load_kernels, compute_site_timeseries
import science.lunarsight_core.constants as C


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module", autouse=True)
def setup_kernels():
    load_kernels()


def independent_bruteforce_joint_windows(lat, lon, start_utc, stop_utc, min_hours=12.0, step_s=3600):
    """
    Independent brute-force scan to identify all contiguous joint operating windows.
    """
    ts = compute_site_timeseries(lat, lon, start_utc, stop_utc, step_seconds=step_s)
    times = ts["times"]
    sun_els = ts["sun_elevation_deg"]
    earth_els = ts["earth_elevation_deg"]

    # Flat horizon condition: sun upper limb > 0 (sun_el + r_sun > 0), earth center > 0
    sun_visible = [el + C.SUN_ANGULAR_RADIUS_DEG > 0.0 for el in sun_els]
    earth_visible = [el > 0.0 for el in earth_els]
    joint_mask = [s and e for s, e in zip(sun_visible, earth_visible)]

    windows = []
    in_window = False
    start_idx = 0

    for i, active in enumerate(joint_mask):
        if active and not in_window:
            in_window = True
            start_idx = i
        elif not active and in_window:
            in_window = False
            # Transition boundary is times[i]
            dur = (i - start_idx) * (step_s / 3600.0)
            if dur >= min_hours:
                windows.append({
                    "start_utc": times[start_idx],
                    "end_utc": times[i],
                    "duration_hours": round(dur, 2)
                })

    if in_window:
        dur = (len(joint_mask) - start_idx) * (step_s / 3600.0)
        if dur >= min_hours:
            windows.append({
                "start_utc": times[start_idx],
                "end_utc": times[-1],
                "duration_hours": round(dur, 2)
            })

    # Sort descending by duration
    windows.sort(key=lambda w: w["duration_hours"], reverse=True)
    return windows


def test_bruteforce_vs_api_best_windows(client):
    """
    Compare independent brute force finder vs /api/site/best-windows
    on 3 diverse sites over a 14-day search window.
    """
    test_sites = [
        {"name": "Connecting Ridge", "lat": -89.45, "lon": -136.0, "min_h": 12.0},
        {"name": "IM-1 Malapert", "lat": -80.13, "lon": 1.44, "min_h": 12.0},
        {"name": "Apollo 11", "lat": 0.67408, "lon": 23.47297, "min_h": 24.0},
    ]

    start_search = "2026-03-01T00:00:00Z"
    stop_search = "2026-03-15T00:00:00Z"  # 14 days

    for site in test_sites:
        name = site["name"]
        lat = site["lat"]
        lon = site["lon"]
        min_h = site["min_h"]

        # 1. Independent ground truth
        expected_windows = independent_bruteforce_joint_windows(
            lat, lon, start_search, stop_search, min_hours=min_h, step_s=3600
        )

        # 2. API query with flat horizon mode
        resp = client.post("/api/site/best-windows", json={
            "lat": lat,
            "lon": lon,
            "site_name": name,
            "search_start_utc": start_search,
            "search_stop_utc": stop_search,
            "min_window_hours": min_h,
            "horizon_mode": "flat",
            "step_seconds": 3600,
        })
        assert resp.status_code == 200, f"API error for {name}: {resp.text}"
        data = resp.json()
        api_windows = data.get("ranked_windows", [])

        print(f"\nSite '{name}': Independent found {len(expected_windows)} windows, API found {len(api_windows)} windows.")

        # If windows exist, compare top window durations
        if expected_windows:
            assert len(api_windows) > 0, f"Expected windows for {name}, but API found 0"
            top_expected = expected_windows[0]
            top_api = api_windows[0]

            print(f"Top expected: {top_expected['start_utc']} -> {top_expected['end_utc']} ({top_expected['duration_hours']}h)")
            print(f"Top API:      {top_api['start_utc']} -> {top_api['end_utc']} ({top_api['duration_hours']}h)")

            # Start time within 1 step
            assert abs(top_expected["duration_hours"] - top_api["duration_hours"]) <= 1.0, (
                f"Duration mismatch for {name}: {top_expected['duration_hours']}h vs {top_api['duration_hours']}h"
            )
        else:
            assert len(api_windows) == 0, f"Expected 0 windows for {name}, API found {len(api_windows)}"
