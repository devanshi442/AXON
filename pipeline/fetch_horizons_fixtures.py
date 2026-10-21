"""Fetch JPL Horizons topocentric Az/El of Sun and Earth for a lunar surface site (golden-test fixtures).
Usage: python pipeline/fetch_horizons_fixtures.py im-1 -80.13 1.44 2024-03-01 2024-03-10
Horizons params follow https://ssd-api.jpl.nasa.gov/doc/horizons.html -- confirm site-coordinate syntax
(CENTER='coord@301', COORD_TYPE, SITE_COORD = east-lon,lat,alt-km) there. Not network-tested here."""
import sys, json, pathlib, urllib.parse, urllib.request
name, lat, lon, start, stop = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5]
out = pathlib.Path("science/fixtures/horizons"); out.mkdir(parents=True, exist_ok=True)
for body, cmd in (("sun", "10"), ("earth", "399")):
    q = {"format": "json", "COMMAND": f"'{cmd}'", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER",
         "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'", "SITE_COORD": f"'{lon},{lat},0'",
         "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": "'60 min'",
         "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "APPARENT": "'AIRLESS'", "CSV_FORMAT": "'YES'"}
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url) as r:
        (out / f"{name}_{body}_{start}_{stop}.json").write_text(json.dumps(json.load(r), indent=1))
    print("saved", name, body)
