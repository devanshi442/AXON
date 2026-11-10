"""
run_benchmarks.py — Comprehensive Scientific Performance, Latency & Concurrency Benchmark Suite.

Measures:
1. Cold-cache vs Warm-cache p50/p95 latency for:
   - Single site analysis (14 days, hourly)
   - 3D Terrain Horizon mask build (Shackleton, 50 km)
   - 4-Site synchronized comparison (7 days)
2. Whole-process Resident Set Size (RSS) in MB via psutil.
3. 5 Concurrent requests including /api/health latency during an active long analysis.
"""

import concurrent.futures
import os
import sys
import time
from pathlib import Path
import numpy as np
import psutil

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient
from main import app
from api.cache import analysis_cache, horizon_cache
from api.services.analysis_service import analysis_service
from lunarsight_core import horizon as H

analysis_service.load_kernels()


def measure_latencies(func, n_runs: int) -> tuple[float, float, list[float]]:
    times = []
    for _ in range(n_runs):
        t0 = time.perf_counter()
        func()
        t1 = time.perf_counter()
        times.append((t1 - t0) * 1000.0)
    p50 = float(np.percentile(times, 50))
    p95 = float(np.percentile(times, 95))
    return p50, p95, times


def run_comprehensive_benchmarks():
    proc = psutil.Process()
    with TestClient(app) as client:
        print("=" * 80)
        print("AXON LUNARSIGHT — PRODUCTION BENCHMARK & CONCURRENCY PROFILE")
        print("=" * 80)

        # Baseline RSS
        rss_baseline = proc.memory_info().rss / (1024 * 1024)
        print(f"\n[Memory] Process Initial RSS: {rss_baseline:.2f} MB")

        # -------------------------------------------------------------------
        # 1. Single Site Analysis (Apollo 11, 14 days, hourly = 336 points)
        # -------------------------------------------------------------------
        print("\n[Benchmark 1/3] Single Site Analysis (Apollo 11, 14 days, hourly):")
        def call_single_cold(i):
            analysis_cache.clear()
            resp = client.post("/api/site/analyze", json={
                "lat": 0.67408, "lon": 23.47297,
                "start_utc": "2026-03-01T00:00:00Z", "stop_utc": "2026-03-15T00:00:00Z",
                "horizon_mode": "flat", "step_seconds": 3600,
            })
            assert resp.status_code == 200

        single_cold_times = []
        for i in range(5):
            t0 = time.perf_counter()
            call_single_cold(i)
            single_cold_times.append((time.perf_counter() - t0) * 1000.0)
        single_cold_p50 = np.percentile(single_cold_times, 50)
        single_cold_p95 = np.percentile(single_cold_times, 95)

        def call_single_warm():
            resp = client.post("/api/site/analyze", json={
                "lat": 0.67408, "lon": 23.47297,
                "start_utc": "2026-03-01T00:00:00Z", "stop_utc": "2026-03-15T00:00:00Z",
                "horizon_mode": "flat", "step_seconds": 3600,
            })
            assert resp.status_code == 200

        single_warm_p50, single_warm_p95, _ = measure_latencies(call_single_warm, 10)
        print(f"  Cold Cache: p50 = {single_cold_p50:.2f} ms | p95 = {single_cold_p95:.2f} ms")
        print(f"  Warm Cache: p50 = {single_warm_p50:.2f} ms | p95 = {single_warm_p95:.2f} ms")

        # -------------------------------------------------------------------
        # 2. 3D Terrain Horizon Mask Build (Shackleton, 360 rays, 50 km)
        # -------------------------------------------------------------------
        print("\n[Benchmark 2/3] 3D Terrain Horizon Mask Build (Shackleton, 360 rays, 50 km):")
        horizon_cold_times = []
        for _ in range(3):
            horizon_cache.clear()
            t0 = time.perf_counter()
            mask = H.compute_horizon_raymarch(-89.9, 0.0, observer_height_m=2.0, max_range_km=50.0, az_step_deg=1.0)
            assert mask is not None
            horizon_cold_times.append((time.perf_counter() - t0) * 1000.0)
        horizon_cold_p50 = np.percentile(horizon_cold_times, 50)
        horizon_cold_p95 = np.percentile(horizon_cold_times, 95)

        # Seed cache
        analysis_service.get_horizon_mask(-89.9, 0.0, mast_height_m=2.0, max_range_km=50.0, az_step_deg=1.0)
        def call_horizon_warm():
            mask = analysis_service.get_horizon_mask(-89.9, 0.0, mast_height_m=2.0, max_range_km=50.0, az_step_deg=1.0)
            assert mask is not None
        horizon_warm_p50, horizon_warm_p95, _ = measure_latencies(call_horizon_warm, 10)
        print(f"  Cold Cache: p50 = {horizon_cold_p50:.2f} ms | p95 = {horizon_cold_p95:.2f} ms")
        print(f"  Warm Cache: p50 = {horizon_warm_p50:.2f} ms | p95 = {horizon_warm_p95:.2f} ms")

        # -------------------------------------------------------------------
        # 3. 4-Site Synchronized Comparison (7 days common window)
        # -------------------------------------------------------------------
        print("\n[Benchmark 3/3] 4-Site Synchronized Comparison (7 days common window):")
        comp_payload = {
            "sites": [
                {"id": "cs-connecting-ridge", "mast_height_m": 2.0},
                {"id": "cs-shackleton-rim", "mast_height_m": 2.0},
                {"lat": 0.67408, "lon": 23.47297, "name": "Apollo 11", "mast_height_m": 2.0},
                {"lat": 0.0, "lon": 180.0, "name": "Far Side", "mast_height_m": 2.0},
            ],
            "start_utc": "2026-03-01T00:00:00Z",
            "stop_utc": "2026-03-08T00:00:00Z",
            "horizon_mode": "flat",
        }
        comp_cold_times = []
        for _ in range(3):
            analysis_cache.clear()
            t0 = time.perf_counter()
            resp = client.post("/api/compare", json=comp_payload)
            assert resp.status_code == 200
            comp_cold_times.append((time.perf_counter() - t0) * 1000.0)
        comp_cold_p50 = np.percentile(comp_cold_times, 50)
        comp_cold_p95 = np.percentile(comp_cold_times, 95)

        def call_comp_warm():
            resp = client.post("/api/compare", json=comp_payload)
            assert resp.status_code == 200
        comp_warm_p50, comp_warm_p95, _ = measure_latencies(call_comp_warm, 10)
        print(f"  Cold Cache: p50 = {comp_cold_p50:.2f} ms | p95 = {comp_cold_p95:.2f} ms")
        print(f"  Warm Cache: p50 = {comp_warm_p50:.2f} ms | p95 = {comp_warm_p95:.2f} ms")

        # -------------------------------------------------------------------
        # 4. Whole-process RSS Profile
        # -------------------------------------------------------------------
        rss_peak = proc.memory_info().rss / (1024 * 1024)
        print(f"\n[Memory] Whole-Process Resident Set Size (RSS): {rss_peak:.2f} MB")

        # -------------------------------------------------------------------
        # 5. Concurrent Requests & /api/health Latency Under Active Load
        # -------------------------------------------------------------------
        print("\n[Benchmark Concurrency] 5 Concurrent Requests during Active Long Calculation:")
        health_latencies = []
        results = []

        def worker_long_task():
            # 60 days hourly = 1440 steps
            t0 = time.perf_counter()
            r = client.post("/api/site/analyze", json={
                "lat": -89.5, "lon": 0.0,
                "start_utc": "2026-01-01T00:00:00Z", "stop_utc": "2026-03-02T00:00:00Z",
                "horizon_mode": "flat", "step_seconds": 3600
            })
            return "long_task", (time.perf_counter() - t0) * 1000.0, r.status_code

        def worker_health(idx):
            time.sleep(0.01 * idx)  # stagger slightly into active execution
            t0 = time.perf_counter()
            r = client.get("/api/health")
            lat = (time.perf_counter() - t0) * 1000.0
            return f"health_{idx}", lat, r.status_code

        def worker_ready():
            t0 = time.perf_counter()
            r = client.get("/api/ready")
            return "ready", (time.perf_counter() - t0) * 1000.0, r.status_code

        def worker_sites():
            t0 = time.perf_counter()
            r = client.get("/api/sites")
            return "sites", (time.perf_counter() - t0) * 1000.0, r.status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            f_long = pool.submit(worker_long_task)
            f_h1 = pool.submit(worker_health, 1)
            f_h2 = pool.submit(worker_health, 2)
            f_ready = pool.submit(worker_ready)
            f_sites = pool.submit(worker_sites)

            for f in [f_long, f_h1, f_h2, f_ready, f_sites]:
                name, latency, code = f.result()
                results.append((name, latency, code))
                if "health" in name:
                    health_latencies.append(latency)
                print(f"  Endpoint: {name:<12} | Latency: {latency:6.2f} ms | Status: {code}")

        print(f"\n  Average /api/health Latency during Active Load: {np.mean(health_latencies):.2f} ms")
        print("\n" + "=" * 80)
        print("FINAL PRODUCTION PERFORMANCE SUMMARY")
        print("=" * 80)
        print(f"{'Operation':<35} | {'Cold p50':<10} | {'Cold p95':<10} | {'Warm p50':<10} | {'Warm p95':<10}")
        print("-" * 80)
        print(f"{'Single Site Analysis':<35} | {single_cold_p50:7.2f} ms | {single_cold_p95:7.2f} ms | {single_warm_p50:7.2f} ms | {single_warm_p95:7.2f} ms")
        print(f"{'3D Terrain Horizon Build':<35} | {horizon_cold_p50:7.2f} ms | {horizon_cold_p95:7.2f} ms | {horizon_warm_p50:7.2f} ms | {horizon_warm_p95:7.2f} ms")
        print(f"{'4-Site Synchronized Compare':<35} | {comp_cold_p50:7.2f} ms | {comp_cold_p95:7.2f} ms | {comp_warm_p50:7.2f} ms | {comp_warm_p95:7.2f} ms")
        print(f"{'Whole-Process RSS':<35} | {rss_peak:7.2f} MB")
        print("=" * 80)


if __name__ == "__main__":
    run_comprehensive_benchmarks()
