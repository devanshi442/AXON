"""
pipeline/download_dems.py — Automated downloader and SHA-256 verifier for Lunar LOLA DEMs.

Reads terrain.lock and ensures all DEM files are present and match authentic PDS checksums.
If files are missing or incomplete, downloads them with HTTP Range resume support.

HOSTING AND DELIVERY OPTIONS FOR DEPLOYMENT:
-------------------------------------------
1. Dedicated Object Storage (Recommended for Cloud Deployments):
   Host the 1.48 GB DEM directory on Amazon S3, Google Cloud Storage (GCS), or Cloudflare R2:
     export DEM_BASE_URL="https://pub-your-bucket-id.r2.dev/terrain"
     python pipeline/download_dems.py --download
   Benefits: Zero egress fees (Cloudflare R2), high download speeds, independent of NASA PDS rate limits.

2. NASA PDS Geosciences Node (Default Fallback):
   Direct public archive from Washington University in St. Louis:
     Polar: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_sh/
     Global: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/

3. Container Mount / Volume Storage (Docker & Kubernetes):
   Pre-seed terrain/ on a host volume or persistent volume claim (PVC) and mount read-only:
     docker run -d -p 8000:8000 -v /mnt/axon-terrain:/app/terrain:ro axon-lunarsight:latest
   Benefits: Instant container startup, zero container image bloat (image stays ~180 MB).
"""

import hashlib
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TERRAIN_LOCK = ROOT / "terrain.lock"

# Default NASA PDS Geosciences mirrors
PDS_BASE_SH = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_sh"
PDS_BASE_GDR = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical"


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def load_lockfile() -> dict[str, str]:
    if not TERRAIN_LOCK.is_file():
        raise FileNotFoundError(f"Missing {TERRAIN_LOCK}")
    expected = {}
    for line in TERRAIN_LOCK.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            parts = line.split()
            if len(parts) >= 2:
                expected[parts[1]] = parts[0]
    return expected


def download_with_resume(url: str, target_path: Path, expected_hash: str) -> bool:
    """Download file with HTTP Range resume support and progress reporting."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target_path.with_suffix(target_path.suffix + ".part")

    existing_bytes = temp_path.stat().st_size if temp_path.is_file() else 0

    headers = {"User-Agent": "AXON-LunarSight-Downloader/1.0"}
    if existing_bytes > 0:
        headers["Range"] = f"bytes={existing_bytes}-"
        print(f"  Resuming from byte offset {existing_bytes} ({existing_bytes / (1024*1024):.1f} MB)...")

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            mode = "ab" if (status == 206 and existing_bytes > 0) else "wb"
            if mode == "wb":
                existing_bytes = 0

            with open(temp_path, mode) as f:
                while chunk := resp.read(256 * 1024):
                    f.write(chunk)

        # Download finished; verify checksum before renaming
        temp_hash = compute_sha256(temp_path)
        if temp_hash == expected_hash:
            if target_path.is_file():
                target_path.unlink()
            temp_path.rename(target_path)
            return True
        else:
            print(f"  Checksum mismatch for {target_path.name}: expected {expected_hash}, got {temp_hash}")
            temp_path.unlink(missing_ok=True)
            return False

    except Exception as exc:
        print(f"  Download error for {url}: {exc}")
        return False


def verify_and_fetch_dems(download_missing: bool = False, base_url: str | None = None) -> bool:
    expected = load_lockfile()
    custom_base = base_url or os.environ.get("DEM_BASE_URL")
    all_ok = True
    print(f"Verifying {len(expected)} DEM assets against terrain.lock...")
    if custom_base:
        print(f"Using custom DEM mirror: {custom_base}")

    for rel_path, expected_hash in expected.items():
        file_path = ROOT / rel_path

        # If file exists, verify hash
        if file_path.is_file():
            actual_hash = compute_sha256(file_path)
            if actual_hash == expected_hash:
                size_mb = file_path.stat().st_size / (1024 * 1024)
                print(f"OK: {rel_path} ({size_mb:.2f} MB)")
                continue
            else:
                print(f"CORRUPT: {rel_path} (hash mismatch)")

        # File is missing or corrupt
        print(f"MISSING / INVALID: {rel_path}")
        if not download_missing:
            all_ok = False
            continue

        filename = file_path.name
        if custom_base:
            url = f"{custom_base.rstrip('/')}/{rel_path}"
        elif "global" in rel_path:
            url = f"{PDS_BASE_GDR}/{filename}"
        else:
            url = f"{PDS_BASE_SH}/{filename}"

        print(f"Downloading from {url}...")
        success = download_with_resume(url, file_path, expected_hash)
        if success:
            print(f"SUCCESS: {rel_path}")
        else:
            all_ok = False

    return all_ok


if __name__ == "__main__":
    download = "--download" in sys.argv
    base_arg = None
    for i, arg in enumerate(sys.argv):
        if arg == "--base-url" and i + 1 < len(sys.argv):
            base_arg = sys.argv[i + 1]

    ok = verify_and_fetch_dems(download_missing=download, base_url=base_arg)
    sys.exit(0 if ok else 1)
