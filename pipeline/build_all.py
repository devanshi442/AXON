"""
build_all.py — One-command idempotent pipeline to validate data, run benchmarks,
precompute horizons, generate geometry timeseries, and update provenance.

Execution Order:
1. pipeline/validate_missions.py
2. science/lunarsight_core/benchmark.py
3. pipeline/build_horizon.py
4. pipeline/build_geometry.py
5. pipeline/generate_data_readme.py
"""

from __future__ import annotations

import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
PYTHON = sys.executable


def run_step(step_name: str, script_path: pathlib.Path, args: list[str] | None = None):
    print(f"\n{'='*70}\n>>> STEP: {step_name} ({script_path.name})\n{'='*70}")
    cmd = [PYTHON, str(script_path)] + (args or [])
    t0 = time.time()
    res = subprocess.run(cmd, cwd=ROOT, text=True)
    if res.returncode != 0:
        print(f"FAILED step '{step_name}' with exit code {res.returncode}")
        sys.exit(res.returncode)
    elapsed = round(time.time() - t0, 2)
    print(f">>> OK: {step_name} completed in {elapsed}s\n")


def print_artifacts_summary():
    print(f"\n{'='*70}\n>>> ARTIFACT STORAGE SUMMARY\n{'='*70}")
    out_web = ROOT / "web" / "public" / "data"
    total_bytes = 0
    categories = ["timeseries", "horizon", "events", "summary"]

    for cat in categories:
        dir_path = out_web / cat
        if dir_path.is_dir():
            files = list(dir_path.glob("*.json"))
            cat_bytes = sum(f.stat().st_size for f in files)
            total_bytes += cat_bytes
            print(f"  {cat:12s}: {len(files):2d} files, {cat_bytes / (1024*1024):.2f} MB")

    for standalone in ["missions.json", "manifest.json", "benchmark.json"]:
        f = out_web / standalone
        if f.is_file():
            b = f.stat().st_size
            total_bytes += b
            print(f"  {standalone:12s}: 1 file , {b / 1024:.1f} KB")

    total_mb = total_bytes / (1024 * 1024)
    print(f"  ------------------------------------------------")
    print(f"  TOTAL WEB DATA: {total_mb:.2f} MB (Target: <= 25.0 MB)")
    if total_mb <= 25.0:
        print(f"  STATUS: PASS (under 25 MB budget)")
    else:
        print(f"  STATUS: WARNING (exceeds 25 MB budget)")
    print(f"{'='*70}\n")


def main():
    print(f"Starting AXON LunarSight full build pipeline...")
    total_t0 = time.time()

    # Step 1: Validate missions data & schema
    run_step("Validate Missions", ROOT / "pipeline" / "validate_missions.py")

    # Step 2: Compute real Horizons benchmarks & validation artifact
    run_step("Compute Benchmarks", ROOT / "science" / "lunarsight_core" / "benchmark.py")

    # Step 3: Precompute terrain horizons across mast heights & ranges
    run_step("Precompute Terrain Horizons", ROOT / "pipeline" / "build_horizon.py")

    # Step 4: Precompute geometry, dual flat/terrain metrics & dynamic manifest
    run_step("Precompute Geometry & Metrics", ROOT / "pipeline" / "build_geometry.py")

    # Step 5: Regenerate DATA_README with verified file hashes
    run_step("Generate DATA_README", ROOT / "pipeline" / "generate_data_readme.py")

    # Step 6: Print storage summary
    print_artifacts_summary()

    total_elapsed = round(time.time() - total_t0, 1)
    print(f"AXON LunarSight full pipeline completed successfully in {total_elapsed}s!")


if __name__ == "__main__":
    main()
