"""
inspect_terrain_all.py — Read every downloaded JP2 with rasterio, extract
CRS/projection, pixel size, bounds, nodata, and LBL height scaling.
Then look up IM-1 and IM-2 elevations using pyproj polar-stereographic transform.

Usage:
    python pipeline/inspect_terrain_all.py
"""
import pathlib
import re
import sys

TERRAIN = pathlib.Path("terrain")

# Elevation lookup sites (lon_E, lat)
LOOKUP_SITES = {
    "IM-1": {"lat": -80.13, "lon_e": 1.44},
    "IM-2": {"lat": -84.7906, "lon_e": 29.1957},
}


def parse_lbl(lbl_path: pathlib.Path) -> dict:
    """Extract key fields from PDS3 label file."""
    info = {}
    if not lbl_path.exists():
        return info
    text = lbl_path.read_text(encoding="utf-8", errors="replace")
    patterns = {
        "SCALING_FACTOR": r'SCALING_FACTOR\s*=\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)',
        "OFFSET": r'OFFSET\s*=\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)',
        "MISSING_CONSTANT": r'MISSING_CONSTANT\s*=\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)',
        "MAP_SCALE": r'MAP_SCALE\s*=\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)',
        "UNIT": r'MAP_SCALE\s*=\s*[+-]?\d+\.?\d*\s*<([^>]+)>',
    }
    for key, pat in patterns.items():
        m = re.search(pat, text)
        if m:
            info[key] = m.group(1)
    return info


def main() -> int:
    try:
        import rasterio
        from rasterio.crs import CRS
    except ImportError:
        print("ERROR: rasterio not installed. Run: pip install rasterio")
        return 1

    try:
        from pyproj import Proj
    except ImportError:
        print("ERROR: pyproj not installed. Run: pip install pyproj")
        return 1

    import numpy as np

    products = [
        "LDEM_875S_20M",
        "LDEM_85S_40M",
        "LDEM_85S_20M",
        "LDEM_80S_40M",
        "LDEM_80S_20M",
    ]

    results = {}

    for stem in products:
        jp2 = TERRAIN / f"{stem}.JP2"
        lbl = TERRAIN / f"{stem}_JP2.LBL"
        print(f"\n{'='*60}")
        print(f"  {stem}")
        print(f"{'='*60}")

        if not jp2.exists():
            print(f"  MISSING: {jp2}")
            results[stem] = {"status": "missing"}
            continue

        # Parse LBL
        lbl_info = parse_lbl(lbl)
        scaling = float(lbl_info.get("SCALING_FACTOR", 0.5))
        offset = float(lbl_info.get("OFFSET", 0.0))
        nodata_raw = lbl_info.get("MISSING_CONSTANT")
        print(f"  LBL: scaling={scaling}, offset={offset}, nodata_raw={nodata_raw}")
        print(f"       map_scale={lbl_info.get('MAP_SCALE')} {lbl_info.get('UNIT','m')}")

        try:
            with rasterio.open(str(jp2)) as ds:
                crs = ds.crs
                transform = ds.transform
                width, height = ds.width, ds.height
                band = ds.read(1)
                nodata_val = ds.nodata
                bounds = ds.bounds

                # Pixel size
                px_x = abs(transform.a)
                px_y = abs(transform.e)

                print(f"  CRS: {crs.to_string() if crs else 'NONE (will build from LBL)'}")
                print(f"  Pixel size: {px_x:.2f} x {px_y:.2f} m")
                print(f"  Size: {width} x {height} px")
                print(f"  Bounds (native): left={bounds.left:.1f}, bottom={bounds.bottom:.1f}, "
                      f"right={bounds.right:.1f}, top={bounds.top:.1f}")
                print(f"  Nodata (rasterio): {nodata_val}")

                # Build pyproj projection for Moon polar stereographic
                # Moon sphere R=1737400 m, South pole, standard parallel = 90S
                # Use "+proj=stere +lat_ts=-90 +lat_0=-90 +lon_0=0 +R=1737400"
                if crs:
                    proj = Proj(crs)
                else:
                    proj = Proj("+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m")

                # Build transform if native CRS is missing
                if not crs:
                    from rasterio.transform import from_origin
                    print("  NOTE: No CRS in JP2; building transform from LBL map_scale")
                    # Use the existing transform from the file
                    print(f"  Native transform: {transform}")

                r = {
                    "status": "ok",
                    "crs": crs.to_string() if crs else "none (built from LBL)",
                    "pixel_size_m": px_x,
                    "width": width,
                    "height": height,
                    "bounds": dict(bounds._asdict()),
                    "nodata_rasterio": nodata_val,
                    "lbl_scaling": scaling,
                    "lbl_offset": offset,
                    "lbl_nodata_raw": nodata_raw,
                }

                # Elevation lookups — only for 80S products (cover IM-1 at -80.13)
                if "80S" in stem:
                    elevations = {}
                    for site_name, site in LOOKUP_SITES.items():
                        lat, lon_e = site["lat"], site["lon_e"]
                        # Project lat/lon to polar-stereographic x,y
                        x, y = proj(lon_e, lat)
                        # Convert x,y to raster pixel row/col using rasterio transform
                        col_f = (x - transform.c) / transform.a
                        row_f = (y - transform.f) / transform.e
                        col = int(col_f)
                        row = int(row_f)

                        if 0 <= row < height and 0 <= col < width:
                            raw_val = int(band[row, col])
                            is_nodata = (nodata_raw is not None and raw_val == int(float(nodata_raw)))
                            elev_m = raw_val * scaling + offset
                            print(f"  {site_name} ({lat}°N, {lon_e}°E): "
                                  f"row={row}, col={col}, raw={raw_val}, "
                                  f"elev={elev_m:.1f} m  nodata={is_nodata}")
                            elevations[site_name] = {
                                "lat": lat, "lon_e": lon_e,
                                "pixel_row": row, "pixel_col": col,
                                "raw_dn": raw_val, "elevation_m": elev_m,
                                "is_nodata": is_nodata,
                            }
                        else:
                            print(f"  {site_name}: OUT OF BOUNDS (row={row}, col={col})")
                            elevations[site_name] = {"status": "out_of_bounds", "row": row, "col": col}

                    r["elevation_lookups"] = elevations

                results[stem] = r

        except Exception as exc:
            print(f"  ERROR reading {jp2}: {exc}")
            results[stem] = {"status": f"error: {exc}"}

    # Summary
    print("\n" + "="*60)
    print("TERRAIN READ SUMMARY")
    print("="*60)
    for stem, r in results.items():
        status = r.get("status", "?")
        if status == "ok":
            px = r.get("pixel_size_m", "?")
            print(f"  OK   {stem:25s}  {px:.0f} m/px  CRS={'yes' if 'none' not in r.get('crs','none') else 'built'}")
            if "elevation_lookups" in r:
                for site, ev in r["elevation_lookups"].items():
                    if "elevation_m" in ev:
                        print(f"       {site:10s}: {ev['elevation_m']:.1f} m")
        else:
            print(f"  FAIL {stem:25s}  {status}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
