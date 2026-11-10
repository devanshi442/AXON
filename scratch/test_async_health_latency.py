import asyncio
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
sys.path.insert(0, str(root / "science"))

import time
import httpx
from api.main import app
from api.cache import analysis_cache, horizon_cache
from api.services.analysis_service import analysis_service

async def run_heavy_job(client: httpx.AsyncClient):
    payload = {
        "lat": -89.534,
        "lon": -150.052,
        "start_utc": "2026-01-01T00:00:00Z",
        "stop_utc": "2026-03-31T00:00:00Z",
        "step_seconds": 3600,
        "horizon_mode": "flat",
    }
    t0 = time.perf_counter()
    resp = await client.post("/api/site/analyze", json=payload, timeout=60.0)
    dur = (time.perf_counter() - t0) * 1000.0
    return resp.status_code, dur

async def ping_health(client: httpx.AsyncClient):
    t0 = time.perf_counter()
    resp = await client.get("/api/health", timeout=5.0)
    elapsed = (time.perf_counter() - t0) * 1000.0
    return resp.status_code, elapsed

async def main():
    analysis_service.load_kernels()
    analysis_cache.clear()
    horizon_cache.clear()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Warmup
        await client.get("/api/health")
        
        # Start heavy job (151 days hourly calculation = 3625 ephemeris steps)
        heavy_task = asyncio.create_task(run_heavy_job(client))
        
        # Give heavy job a moment to enter SPICE computation
        await asyncio.sleep(0.05)
        
        # Concurrently ping /api/health while heavy job is running
        latencies = []
        for _ in range(30):
            status, el = await ping_health(client)
            assert status == 200
            latencies.append(el)
            await asyncio.sleep(0.02)
            
        heavy_status, heavy_dur = await heavy_task
        assert heavy_status == 200, f"Heavy status was {heavy_status}"
        
        import numpy as np
        p50 = np.percentile(latencies, 50)
        p95 = np.percentile(latencies, 95)
        out = (
            f"Heavy job duration: {heavy_dur:.2f} ms\n"
            f"Health pings: {len(latencies)} requests\n"
            f"Health latency: min = {min(latencies):.2f} ms | p50 = {p50:.2f} ms | p95 = {p95:.2f} ms | max = {max(latencies):.2f} ms\n"
        )
        print(out)
        
        evidence_dir = root / "docs" / "verification" / "evidence"
        evidence_dir.mkdir(parents=True, exist_ok=True)
        (evidence_dir / "async_health_latency.txt").write_text(out, encoding="utf-8")

if __name__ == "__main__":
    asyncio.run(main())
