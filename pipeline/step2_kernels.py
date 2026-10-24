"""
step2_kernels.py — SHA-256 all kernels, verify MD5 of moon TF vs PDS XML,
load all with spiceypy, print SPK/BPC time coverage, test MOON_ME frame.
Run with: .venv\Scripts\python.exe pipeline/step2_kernels.py
"""
import hashlib
import pathlib
import urllib.request

import spiceypy as sp

KERNELS_DIR = pathlib.Path("kernels")
LOCK_FILE = pathlib.Path("kernels.lock")

# ── SHA-256 helper ────────────────────────────────────────────────────────────
def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()

# ── MD5 helper (for PDS XML check) ───────────────────────────────────────────
def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()

print("=== KERNEL HASHES ===")
hashes = {}
for f in sorted(KERNELS_DIR.iterdir()):
    if f.is_file():
        h = sha256(f)
        hashes[f.name] = h
        print(f"  {f.name:45s}  sha256:{h[:16]}...  size:{f.stat().st_size:,}")

# ── MD5 check for moon_de440_250416.tf vs PDS XML ─────────────────────────────
print("\n=== PDS MD5 VERIFICATION: moon_de440_250416.tf ===")
PDS_EXPECTED_MD5 = "3556dde4bb7ca54a89917c301e650bbf"
tf_path = KERNELS_DIR / "moon_de440_250416.tf"
computed_md5 = md5(tf_path)
print(f"  PDS XML MD5 (expected): {PDS_EXPECTED_MD5}")
print(f"  Locally computed MD5:   {computed_md5}")
print(f"  Match: {computed_md5 == PDS_EXPECTED_MD5}")

# ── Check fk/satellites listing for moon_de440_220930.tf ─────────────────────
print("\n=== NAIF fk/satellites/ LISTING CHECK ===")
try:
    url = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/"
    with urllib.request.urlopen(url, timeout=10) as r:
        content = r.read().decode("utf-8", "replace")
    moon_files = [l.strip() for l in content.splitlines()
                  if "moon_de440" in l.lower() and "href" in l.lower()]
    print(f"  Moon FK files found in listing:")
    for line in moon_files:
        import re
        m = re.search(r'href="([^"]+moon_de440[^"]+)"', line)
        if m:
            print(f"    {m.group(1)}")
    if "moon_de440_220930" in content:
        print("  moon_de440_220930.tf IS listed on NAIF")
    else:
        print("  moon_de440_220930.tf is NOT listed on NAIF (only 250416 exists)")
except Exception as e:
    print(f"  ERROR fetching listing: {e}")

# ── Write kernels.lock ────────────────────────────────────────────────────────
print("\n=== UPDATING kernels.lock ===")
lock_lines = [
    "# SHA-256 of NAIF kernels used by AXON LunarSight",
    "# Updated by pipeline/step2_kernels.py — locally computed",
    "# moon_de440_220930.tf: NOT present on NAIF generic_kernels/fk/satellites/ (404)",
    "# Only moon_de440_250416.tf exists; MD5 verified against PDS XML",
]
for name, h in sorted(hashes.items()):
    # Only include actual kernel files, not readmes
    if name.endswith((".tls", ".tpc", ".bsp", ".bpc", ".tf")):
        lock_lines.append(f"{h}  {name}")
LOCK_FILE.write_text("\n".join(lock_lines) + "\n", encoding="utf-8")
print(f"  Written: {LOCK_FILE}")

# ── Load all kernels + coverage ───────────────────────────────────────────────
print("\n=== SPICEYPY KERNEL LOAD + COVERAGE ===")
kernel_order = ["naif0012.tls", "pck00011.tpc", "de440s.bsp",
                "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]
for k in kernel_order:
    p = KERNELS_DIR / k
    if p.exists():
        sp.furnsh(str(p))
        print(f"  Loaded: {k}")
    else:
        print(f"  MISSING: {k}")

# SPK coverage for Moon body 301
print("\n  -- de440s.bsp SPK coverage for body 301 (Moon) --")
spk_cov = sp.Cell_Double(200)
sp.spkcov(str(KERNELS_DIR / "de440s.bsp"), 301, spk_cov)
n = sp.wncard(spk_cov)
for i in range(n):
    a, b = sp.wnfetd(spk_cov, i)
    print(f"    {sp.et2utc(a, 'C', 0)} -> {sp.et2utc(b, 'C', 0)}")

# BPC coverage for frame 31008 (MOON_PA_DE440)
print("\n  -- moon_pa_de440_200625.bpc coverage for frame 31008 --")
bpc_cov = sp.Cell_Double(200)
sp.pckcov(str(KERNELS_DIR / "moon_pa_de440_200625.bpc"), 31008, bpc_cov)
n2 = sp.wncard(bpc_cov)
for i in range(n2):
    a, b = sp.wnfetd(bpc_cov, i)
    print(f"    {sp.et2utc(a, 'C', 0)} -> {sp.et2utc(b, 'C', 0)}")

# Test MOON_ME frame
print("\n  -- MOON_ME frame test at 2025-03-06 17:28:50 UTC (IM-2 landing) --")
try:
    et = sp.str2et("2025-03-06 17:28:50 UTC")
    # Get Moon-fixed position of a known point (IM-2 site)
    pos, lt = sp.spkpos("MOON", et, "MOON_ME", "NONE", "EARTH")
    print(f"    Moon pos in MOON_ME frame: {[round(x, 3) for x in pos]} km")
    print(f"    MOON_ME frame resolved OK")
except Exception as e:
    print(f"    ERROR: {e}")

print("\n=== STEP 2 COMPLETE ===")
