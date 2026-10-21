"""Download a terrain file by URL into terrain/. Get the exact file URL from
https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE/ or https://pgda.gsfc.nasa.gov/products/90
Start with a ~20 m/px 80S-pole product to keep size small. Usage: python pipeline/fetch_terrain.py <url>"""
import sys, pathlib, urllib.request
url = sys.argv[1]; d = pathlib.Path("terrain"); d.mkdir(exist_ok=True)
p = d / url.rsplit("/", 1)[-1]
urllib.request.urlretrieve(url, p); print("saved", p, p.stat().st_size // 1_000_000, "MB")
