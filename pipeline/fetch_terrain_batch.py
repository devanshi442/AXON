"""
fetch_terrain_batch.py — Download all required LOLA south-pole JP2 DEMs plus
their label (.LBL) and auxiliary (.AUX.XML) files into terrain/.

Usage:
    python pipeline/fetch_terrain_batch.py

Downloads (in order, smallest first):
    LDEM_875S_20M   ~20 MB
    LDEM_85S_40M    ~21 MB
    LDEM_85S_20M    ~60 MB
    LDEM_80S_40M    ~69 MB
    LDEM_80S_20M    ~194 MB  (largest; gets its own progress line)

Companion files per product:
    <NAME>_JP2.LBL   — PDS label with scaling / projection metadata
    <NAME>_AUX.XML   — Auxiliary XML

Files are stored flat in terrain/ (gitignored).
"""

import hashlib
import pathlib
import sys
import time
import urllib.error
import urllib.request
from typing import Optional

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST_DIR = ROOT / "terrain"

BASE_JP2 = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/"

# (stem, expected_size_bytes_approx)
PRODUCTS = [
    "LDEM_875S_20M",
    "LDEM_85S_40M",
    "LDEM_85S_20M",
    "LDEM_80S_40M",
    "LDEM_80S_20M",
]


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def download_streaming(url: str, dest: pathlib.Path, label: str = "") -> Optional[int]:
    """Stream url → dest. Returns bytes written or None on error."""
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.unlink(missing_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AXON-LunarSight/1.0"})
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=300) as resp, tmp.open("wb") as f:
            total = int(resp.headers.get("Content-Length", 0))
            written = 0
            while chunk := resp.read(1 << 20):
                f.write(chunk)
                written += len(chunk)
                elapsed = time.time() - t0 or 0.001
                speed = (written / 1024) / elapsed
                if total:
                    pct = written * 100 // total
                    tag = f"  [{label}]  {pct:3d}%  {written/1e6:.1f}/{total/1e6:.1f} MB  {speed:.0f} KB/s   "
                else:
                    tag = f"  [{label}]  {written/1e6:.1f} MB  {speed:.0f} KB/s   "
                print(tag, end="\r", flush=True)
        print()
        tmp.rename(dest)
        return written
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def fetch_one(url: str, dest: pathlib.Path, tag: str) -> dict:
    """Download url → dest and return a result dict."""
    if dest.is_file():
        h = sha256_file(dest)
        sz = dest.stat().st_size
        print(f"  CACHED: {dest.name}  ({sz/1e6:.1f} MB)  sha256:{h[:16]}...")
        return {"status": "cached", "path": str(dest), "size_bytes": sz, "sha256": h}

    print(f"  GET: {url}")
    try:
        size = download_streaming(url, dest, tag)
        h = sha256_file(dest)
        sz = dest.stat().st_size
        print(f"  OK:  {dest.name}  ({sz/1e6:.1f} MB)  sha256:{h[:16]}...")
        return {"status": "downloaded", "path": str(dest), "size_bytes": sz, "sha256": h, "url": url}
    except urllib.error.HTTPError as exc:
        print(f"  ERROR: HTTP {exc.code}  {url}")
        return {"status": "failed", "url": url, "error": f"HTTP {exc.code}"}
    except Exception as exc:
        print(f"  ERROR: {exc}  {url}")
        return {"status": "failed", "url": url, "error": str(exc)}


def main() -> int:
    DEST_DIR.mkdir(exist_ok=True)
    results = {}

    for stem in PRODUCTS:
        print(f"\n{'='*60}")
        print(f"  Product: {stem}")
        print(f"{'='*60}")

        jp2_name = f"{stem}.JP2"
        lbl_name = f"{stem}_JP2.LBL"
        aux_name = f"{stem}_AUX.XML"

        results[jp2_name] = fetch_one(BASE_JP2 + jp2_name, DEST_DIR / jp2_name, stem)
        results[lbl_name] = fetch_one(BASE_JP2 + lbl_name, DEST_DIR / lbl_name, stem + "_LBL")
        results[aux_name] = fetch_one(BASE_JP2 + aux_name, DEST_DIR / aux_name, stem + "_AUX")

    # Summary
    print("\n" + "="*60)
    print("TERRAIN DOWNLOAD SUMMARY")
    print("="*60)
    fails = 0
    for name, r in results.items():
        status = r["status"].upper()
        if r["status"] == "failed":
            fails += 1
            print(f"  FAIL    {name:40s}  {r.get('error','?')}")
        else:
            mb = r["size_bytes"] / 1e6
            print(f"  {status:10s} {name:40s}  {mb:7.1f} MB  {r.get('sha256','?')[:16]}...")

    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
