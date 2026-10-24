"""
fetch_terrain.py — Download a LOLA lunar elevation DEM into terrain/.

Usage (from repo root):
    python pipeline/fetch_terrain.py <url>

Priority downloads (start with the smaller 40 m/px product):
    python pipeline/fetch_terrain.py \\
        https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_40M.JP2

    # Also grab the label file:
    python pipeline/fetch_terrain.py \\
        https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/JP2/LDEM_80S_40M_JP2.LBL

Available products (south pole 80°S to pole):
    LDEM_80S_20M.JP2  — ~194 MB, 20 m/px  (better resolution, larger)
    LDEM_80S_40M.JP2  — ~69 MB,  40 m/px  (start here)
    LDEM_85S_20M.JP2  — ~60 MB,  20 m/px  (85°S to pole)
    LDEM_85S_40M.JP2  — ~21 MB,  40 m/px
    LDEM_875S_20M.JP2 — ~20 MB,  20 m/px  (87.5°S to pole)

See: https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE

Notes on format:
    - JP2 = JPEG2000 raster.  Read with rasterio (with GDAL JP2 drivers) or pillow.
    - Coordinate system: polar stereographic (south pole), units: meters above datum.
    - No-data value: varies by product; check the .LBL file.
    - Coverage: 80°S to −90°  (or 85°/87.5° for smaller products).
    - These files are NOT global; do not use for equatorial or near-side sites.

After downloading, run:
    python pipeline/inspect_terrain.py terrain/LDEM_80S_40M.JP2
to verify the projection and coverage before computing horizon profiles.

IMPORTANT: terrain/ is gitignored. Do not commit large raster files.
"""

import hashlib
import pathlib
import sys
import time
import urllib.error
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST_DIR = ROOT / "terrain"


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def download_streaming(url: str, dest: pathlib.Path) -> pathlib.Path:
    """Stream-download url to dest (with .part file for safety)."""
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.unlink(missing_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AXON-LunarSight/1.0"})
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=120) as resp, tmp.open("wb") as f:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            while chunk := resp.read(1 << 20):
                f.write(chunk)
                downloaded += len(chunk)
                elapsed = time.time() - t0
                speed_kb = (downloaded / 1024) / max(elapsed, 0.001)
                if total:
                    pct = downloaded * 100 // total
                    print(
                        f"  {pct:3d}%  {downloaded / 1e6:.1f} MB / {total / 1e6:.1f} MB"
                        f"  ({speed_kb:.0f} KB/s)   ",
                        end="\r",
                        flush=True,
                    )
        print()
        tmp.rename(dest)
        return dest
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    url = sys.argv[1]
    filename = url.rsplit("/", 1)[-1]

    if not filename:
        print(f"ERROR: Could not determine filename from URL: {url}")
        return 1

    DEST_DIR.mkdir(exist_ok=True)
    dest = DEST_DIR / filename

    # Check if already downloaded
    if dest.is_file():
        size_mb = dest.stat().st_size / 1e6
        print(f"Already present: {dest} ({size_mb:.1f} MB)")
        h = sha256_file(dest)
        print(f"  SHA-256 (locally computed): {h}")
        print("  Re-run with --force to overwrite.")
        return 0

    print(f"Downloading: {url}")
    print(f"Destination: {dest}")

    try:
        dest = download_streaming(url, dest)
    except urllib.error.HTTPError as exc:
        print(f"ERROR: HTTP {exc.code} — {url}")
        return 1
    except urllib.error.URLError as exc:
        print(f"ERROR: Network error — {exc.reason}")
        return 1
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1

    size_mb = dest.stat().st_size / 1e6
    h = sha256_file(dest)
    print(f"Saved: {dest}")
    print(f"  Size: {size_mb:.1f} MB")
    print(f"  SHA-256 (locally computed, not from official NAIF/MIT checksum): {h}")
    print()
    print("Next steps:")
    if filename.endswith(".JP2"):
        lbl_url = url.replace(".JP2", "_JP2.LBL")
        print(f"  Download label:   python pipeline/fetch_terrain.py {lbl_url}")
        print(f"  Inspect terrain:  python pipeline/inspect_terrain.py {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
