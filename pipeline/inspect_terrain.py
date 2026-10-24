"""
inspect_terrain.py — Inspect a downloaded LOLA DEM file and print its projection,
coverage, resolution, and no-data value.

Usage:
    python pipeline/inspect_terrain.py terrain/LDEM_80S_40M.JP2

Requires rasterio (pip install rasterio).  The JP2 format also needs a GDAL
build with JP2 driver support.  On Windows, install GDAL via OSGeo4W or use
the pre-compiled wheels from https://www.lfd.uci.edu/~gohlke/pythonlibs/.

If rasterio is unavailable, the script falls back to printing basic file info.
"""

from __future__ import annotations

import pathlib
import sys


def inspect_with_rasterio(path: pathlib.Path) -> bool:
    try:
        import rasterio  # type: ignore
        import rasterio.transform  # type: ignore
    except ImportError:
        return False

    with rasterio.open(str(path)) as ds:
        print(f"File:        {path}")
        print(f"Format:      {ds.driver}")
        print(f"Size:        {ds.width} x {ds.height} pixels")
        print(f"Bands:       {ds.count}")
        print(f"CRS:         {ds.crs}")
        print(f"Transform:   {ds.transform}")
        print(f"Bounds:      {ds.bounds}")
        print(f"NoData:      {ds.nodata}")
        print(f"Dtype:       {ds.dtypes}")

        # Resolution estimate
        res_x = abs(ds.transform.a)
        res_y = abs(ds.transform.e)
        print(f"Pixel size:  {res_x:.4f} x {res_y:.4f} (map units, typically m for polar stereographic)")

        # Geographic coverage (lat/lon bounds require CRS re-projection)
        try:
            from rasterio.warp import transform_bounds  # type: ignore
            b = transform_bounds(ds.crs, "EPSG:4326", *ds.bounds)
            print(f"Approx lat:  {b[1]:.2f}° to {b[3]:.2f}°")
            print(f"Approx lon:  {b[0]:.2f}° to {b[2]:.2f}°")
        except Exception as exc:
            print(f"  (Could not compute lat/lon bounds: {exc})")

        # Elevation statistics (sample from band 1)
        try:
            data = ds.read(1, masked=True)
            if data.count() > 0:
                print(f"Elevation:   min={data.min():.0f} m, max={data.max():.0f} m, "
                      f"mean={data.mean():.0f} m")
        except Exception as exc:
            print(f"  (Could not read elevation stats: {exc})")

    return True


def inspect_basic(path: pathlib.Path) -> None:
    size = path.stat().st_size
    print(f"File:   {path}")
    print(f"Size:   {size:,} bytes ({size / 1e6:.1f} MB)")
    print()
    print("NOTE: rasterio is not installed. Install it to get projection / coverage details.")
    print("  pip install rasterio")
    print("  (On Windows, GDAL JP2 support may require a pre-compiled GDAL wheel.)")


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python pipeline/inspect_terrain.py <path-to-dem-file>")
        return 1

    path = pathlib.Path(sys.argv[1])
    if not path.is_file():
        print(f"ERROR: File not found: {path}")
        return 1

    ok = inspect_with_rasterio(path)
    if not ok:
        inspect_basic(path)

    return 0


if __name__ == "__main__":
    sys.exit(main())
