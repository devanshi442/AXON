"""
step3_terrain.py — JP2 metadata + windowed elevation lookup only.
Reads ONLY a 5x5 window around each site pixel — never the full raster.

Run: .venv\\Scripts\\python.exe pipeline\\step3_terrain.py
"""
import os, pathlib, re, signal, sys, textwrap
import rasterio
from rasterio.windows import Window
from pyproj import Proj

TERRAIN = pathlib.Path("terrain")
MOON_R_M = 1_737_400.0

# Moon south-pole stereographic — sphere, no ellipsoid
MOON_PS = Proj(proj="stere", lat_0=-90, lat_ts=-90, lon_0=0,
               R=MOON_R_M, units="m")

SITES = {
    "IM-1": (-80.13,   1.44),
    "IM-2": (-84.7906, 29.1957),
}

PRODUCTS = [
    "LDEM_80S_40M",   # start with this: 40 m, 80S — covers both sites
    "LDEM_80S_20M",
    "LDEM_85S_40M",
    "LDEM_85S_20M",
    "LDEM_875S_20M",
]


def parse_lbl(path):
    out = {"SCALING_FACTOR": 0.5, "OFFSET": 0.0,
           "MISSING_CONSTANT": None, "MAP_SCALE": None, "PROJECTION": None}
    if not path.exists():
        return out
    txt = path.read_text(encoding="utf-8", errors="replace")[:8000]
    for key in ("SCALING_FACTOR", "OFFSET", "MISSING_CONSTANT", "MAP_SCALE"):
        m = re.search(rf'{key}\s*=\s*([+-]?\d[\d.]*(?:[eE][+-]?\d+)?)', txt)
        if m:
            out[key] = float(m.group(1))
    m = re.search(r'MAP_PROJECTION_TYPE\s*=\s*"?([^"\n]+)"?', txt)
    if m:
        out["PROJECTION"] = m.group(1).strip()
    return out


def process(stem):
    jp2 = TERRAIN / f"{stem}.JP2"
    lbl = TERRAIN / f"{stem}_JP2.LBL"

    if not jp2.exists():
        print(f"  MISSING: {jp2.name}")
        return

    lbl_info = parse_lbl(lbl)
    scale  = lbl_info["SCALING_FACTOR"]
    offset = lbl_info["OFFSET"]
    nd_raw = lbl_info["MISSING_CONSTANT"]

    print(f"  LBL:  projection={lbl_info['PROJECTION']}  "
          f"map_scale={lbl_info['MAP_SCALE']} m/px")
    print(f"        scale={scale}  offset={offset}  nodata_raw={nd_raw}")

    try:
        with rasterio.open(str(jp2)) as ds:
            tf    = ds.transform
            crs   = ds.crs
            w, h  = ds.width, ds.height
            nd    = ds.nodata
            dtype = ds.dtypes[0]
            bnds  = ds.bounds

            print(f"  rasterio: {w}x{h} px  dtype={dtype}  nodata={nd}")
            print(f"  CRS:      {crs}")
            print(f"  transform (affine): {tf}")
            print(f"  bounds: L={bnds.left:.0f} B={bnds.bottom:.0f} "
                  f"R={bnds.right:.0f} T={bnds.top:.0f} m")

            # Only attempt elevation lookups for 80S products (both sites inside)
            if "80S" in stem and "875" not in stem:
                print(f"\n  --- Elevation lookups (windowed 5x5) ---")
                for name, (lat, lon_e) in SITES.items():
                    # Moon PS x/y
                    sx, sy = MOON_PS(lon_e, lat)
                    # rasterio.DatasetReader.index returns (row, col) for a (x, y) point
                    try:
                        row, col = ds.index(sx, sy)
                    except Exception as e:
                        print(f"    {name}: index() failed: {e}")
                        continue

                    if not (0 <= row < h and 0 <= col < w):
                        print(f"    {name}: OUT OF BOUNDS (row={row}, col={col}, "
                              f"grid={w}x{h})")
                        continue

                    # Windowed read: 5x5 centred on pixel
                    r0 = max(0, row - 2)
                    c0 = max(0, col - 2)
                    win = Window(c0, r0, min(5, w - c0), min(5, h - r0))
                    tile = ds.read(1, window=win)
                    # Centre pixel of the tile
                    tr = row - r0
                    tc = col - c0
                    raw = int(tile[tr, tc])
                    is_nd = (nd_raw is not None and raw == int(nd_raw))
                    elev  = raw * scale + offset
                    print(f"    {name}: lat={lat} lon={lon_e}E  "
                          f"PS=({sx:.0f},{sy:.0f})  px=({col},{row})  "
                          f"raw={raw}  elev={elev:.1f} m  nodata={is_nd}")

    except Exception as e:
        import traceback
        print(f"  ERROR opening {jp2.name}: {e}")
        traceback.print_exc()


def main():
    for stem in PRODUCTS:
        print(f"\n{'='*64}")
        print(f"  {stem}")
        print(f"{'='*64}")
        try:
            process(stem)
        except Exception as e:
            print(f"  UNHANDLED ERROR: {e}")
        sys.stdout.flush()

    print("\n=== STEP 3 COMPLETE ===")


if __name__ == "__main__":
    main()
