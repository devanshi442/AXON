"""Download NAIF kernels into kernels/ and print SHA-256 for kernels.lock.
VERIFY these filenames against https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ before relying on them;
NAIF versions files over time. Not network-tested in the authoring environment."""
import hashlib, pathlib, urllib.request
BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
KERNELS = {
    "naif0012.tls": "lsk/naif0012.tls",
    "pck00011.tpc": "pck/pck00011.tpc",
    "de440s.bsp": "spk/planets/de440s.bsp",
    "moon_pa_de440_200625.bpc": "pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf": "fk/satellites/moon_de440_250416.tf",
}
dest = pathlib.Path("kernels"); dest.mkdir(exist_ok=True)
for name, rel in KERNELS.items():
    p = dest / name
    if not p.exists():
        print("downloading", name); urllib.request.urlretrieve(BASE + rel, p)
    print(hashlib.sha256(p.read_bytes()).hexdigest(), name)
