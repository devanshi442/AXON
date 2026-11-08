"""
fetch_kernels.py — Download and verify NAIF SPICE kernels for AXON LunarSight.

Usage (from repo root):
    python pipeline/fetch_kernels.py

Features:
- Kernels stored FLAT under kernels/ (no sub-folders).
- Skips files already present with matching SHA-256 checksum.
- Streaming download with progress; removes corrupt partial files.
- de440s.bsp falls back to de440.bsp if 404; discrepancy recorded in lock.
- Downloads both moon frame kernels (250416 and 220930) if available.
- Updates kernels.lock with actual hashes after every successful download.

NAIF generic kernels root:
    https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
"""

import hashlib
import pathlib
import sys
import urllib.request
import urllib.error

# ── Kernel manifest ────────────────────────────────────────────────────────────
BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"

# Maps local filename → remote sub-path under BASE.
# Kernels are stored FLAT in kernels/ (no sub-folders).
KERNELS: dict[str, str] = {
    "naif0012.tls":             "lsk/naif0012.tls",
    "pck00011.tpc":             "pck/pck00011.tpc",
    "de440s.bsp":               "spk/planets/de440s.bsp",   # falls back to de440.bsp
    "moon_pa_de440_200625.bpc": "pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf":     "fk/satellites/moon_de440_250416.tf",
    "moon_de440_220930.tf":     "fk/satellites/moon_de440_220930.tf",   # alt frame kernel
    # Auxiliary readme files (no checksum check)
    "aareadme_pck.txt":         "pck/aareadme.txt",
    "aareadme_de440_de441.txt": "spk/planets/aareadme_de440_de441.txt",
}

# Expected SHA-256 (locally computed from prior verified run; NOT from NAIF manifest).
# Leave out readme files and the 220930 kernel (first download; no prior hash).
EXPECTED_SHA256: dict[str, str] = {
    "naif0012.tls":             "678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b",
    "pck00011.tpc":             "3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1",
    "de440s.bsp":               "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2",
    "moon_pa_de440_200625.bpc": "60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f",
    "moon_de440_250416.tf":     "a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768",
}

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST = ROOT / "kernels"
LOCK = ROOT / "kernels.lock"


def is_lfs_pointer(p: pathlib.Path) -> bool:
    """Check if file is a Git-LFS pointer."""
    if p.stat().st_size < 1000:
        try:
            head = p.read_bytes()[:60]
            if b"git-lfs" in head or head.startswith(b"version https://git-lfs"):
                return True
        except Exception:
            pass
    return False


def sha256_file(path: pathlib.Path) -> str:
    """Compute SHA-256 of a file using 1 MiB blocks, normalizing line endings for text files."""
    data = path.read_bytes()
    # Normalize CRLF -> LF for text files (.tls, .tpc, .tf, .txt)
    if path.suffix.lower() in [".tls", ".tpc", ".tf", ".txt"]:
        data = data.replace(b"\r\n", b"\n")
    return hashlib.sha256(data).hexdigest()


def download_streaming(url: str, dest: pathlib.Path) -> None:
    """Stream-download url to dest, printing progress.  Raises on any HTTP/network error."""
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.unlink(missing_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AXON-LunarSight/1.0"})
        with urllib.request.urlopen(req, timeout=180) as resp, tmp.open("wb") as f:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            while chunk := resp.read(1 << 20):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    print(
                        f"    {pct:3d}%  {downloaded / 1_048_576:.1f} MiB"
                        f" / {total / 1_048_576:.1f} MiB",
                        end="\r", flush=True,
                    )
        print()
        tmp.rename(dest)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def main() -> int:
    DEST.mkdir(exist_ok=True)
    hashes: dict[str, str] = {}
    notes: dict[str, str] = {}       # discrepancy notes per kernel
    downloaded: list[str] = []
    already_ok: list[str] = []
    failed: list[str] = []
    skipped: list[str] = []

    for name, rel_path in KERNELS.items():
        p = DEST / name
        expected = EXPECTED_SHA256.get(name)

        # ── Check cached copy ────────────────────────────────────────────────
        if p.is_file():
            if is_lfs_pointer(p):
                print(f"  NOTICE: {name} is a Git-LFS pointer ({p.stat().st_size} bytes). Removing to re-download...")
                p.unlink()
            else:
                actual = sha256_file(p)
                if expected is None or actual == expected:
                    print(f"  OK (cached): {name}  sha256:{actual[:16]}...")
                    hashes[name] = actual
                    already_ok.append(name)
                    continue
                else:
                    print(f"  WARN: {name} hash mismatch — re-downloading")
                    p.unlink()

        # ── Download ─────────────────────────────────────────────────────────
        url = BASE + rel_path
        print(f"  Downloading: {name}")
        print(f"    URL: {url}")

        try:
            download_streaming(url, p)

        except urllib.error.HTTPError as exc:
            # de440s.bsp fallback to de440.bsp if missing
            if name == "de440s.bsp" and exc.code == 404:
                fallback_url = BASE + "spk/planets/de440.bsp"
                print(f"  WARN: de440s.bsp returned 404. Falling back to de440.bsp")
                print(f"    Fallback URL: {fallback_url}")
                try:
                    download_streaming(fallback_url, p)
                    notes[name] = "DISCREPANCY: de440s.bsp 404; downloaded de440.bsp instead"
                    expected = None   # no prior hash for fallback
                except Exception as exc2:
                    print(f"  ERROR: fallback also failed: {exc2}")
                    failed.append(name)
                    continue
            # Some frame kernels may not exist (e.g. 220930 might be superseded)
            elif exc.code in (403, 404):
                print(f"  SKIP: {name} returned HTTP {exc.code} — not available at this URL")
                skipped.append(name)
                continue
            else:
                print(f"  ERROR: HTTP {exc.code} for {url}")
                failed.append(name)
                continue

        except Exception as exc:
            print(f"  ERROR downloading {name}: {exc}")
            failed.append(name)
            continue

        # ── Verify checksum ───────────────────────────────────────────────────
        actual = sha256_file(p)
        if expected and actual != expected:
            print(f"  ERROR: {name} checksum mismatch after download!")
            print(f"    Expected: {expected}")
            print(f"    Got:      {actual}")
            p.unlink()
            failed.append(name)
            continue

        hashes[name] = actual
        downloaded.append(name)
        mb = p.stat().st_size / 1_048_576
        print(f"  Saved {name} ({mb:.1f} MiB)  sha256:{actual[:16]}...")
        if name in notes:
            print(f"  NOTE: {notes[name]}")

    # ── Write kernels.lock ────────────────────────────────────────────────────
    lock_lines = [
        "# SHA-256 of NAIF kernels used by AXON LunarSight",
        "# Updated by pipeline/fetch_kernels.py",
    ]
    for k_name, h in hashes.items():
        line = f"{h}  {k_name}"
        if k_name in notes:
            line += f"  # {notes[k_name]}"
        lock_lines.append(line)
    LOCK.write_text("\n".join(lock_lines) + "\n", encoding="utf-8")

    print()
    print(
        f"Summary: {len(downloaded)} downloaded, "
        f"{len(already_ok)} cached, "
        f"{len(skipped)} skipped, "
        f"{len(failed)} failed"
    )
    if skipped:
        print(f"  SKIPPED (not found at NAIF): {', '.join(skipped)}")
    if failed:
        print(f"  FAILED: {', '.join(failed)}")
        print("  Check URLs at https://naif.jpl.nasa.gov/pub/naif/generic_kernels/")
        return 1
    print(f"  All kernels ready in: {DEST}")
    print(f"  Lock file updated:    {LOCK}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
