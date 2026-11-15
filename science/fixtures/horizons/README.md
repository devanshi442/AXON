# NASA JPL Horizons Golden-Test Fixtures

Precomputed topocentric ephemeris response fixtures from the NASA JPL Horizons on-line solar system data and ephemeris computation service (`https://ssd-api.jpl.nasa.gov/horizons.api`).

These fixtures serve as ground-truth regression targets for `lunarsight_core`'s SPICE-based ephemeris engine, enabling completely offline CI test runs without live network calls.

---

## Fixture Inventory

There are 7 reference sites spanning 4,111 total hourly observation records across Sun and Earth ephemeris vectors:

| Fixture Name | Target Body | Target Lat (deg) | Target E-Lon (deg) | Time Window (UTC) | Hourly Rows |
|---|---|---|---|---|---|
| `apollo11` | Sun & Earth | 0.67408 | 23.47297 | 1969-07-19 to 1969-07-21 | 49 |
| `blue-ghost-1` | Sun & Earth | 18.56000 | 61.81000 | 2025-03-02 to 2025-03-30 | 673 |
| `im-1` | Sun & Earth | -80.13000 | 1.44000 | 2024-02-22 to 2024-03-22 | 697 |
| `im-2` | Sun & Earth | -84.79060 | 29.19570 | 2025-03-02 to 2025-03-30 | 673 |
| `shackleton-rim` | Sun & Earth | -89.68000 | 129.00000 | 2025-03-02 to 2025-03-30 | 673 |
| `farside-0N-180E` | Sun & Earth | 0.00000 | 180.00000 | 2025-03-02 to 2025-03-30 | 673 |
| `nearlimb-0N-90E` | Sun & Earth | 0.00000 | 90.00000 | 2025-03-02 to 2025-03-30 | 673 |
| **Total** | | | | | **4,111** |

> [!NOTE]
> All **4,111** fixture sample rows are verified directly against NAIF SPICE ephemerides without omission in `science/tests/test_geometry.py::test_horizons_golden_all_fixtures_all_rows` and `science/lunarsight_core/benchmark.py`. The preliminary 4,107-row figure cited in early planning notes arose from a temporary boundary cutoff filter that was permanently resolved. See [`docs/VALIDATION.md`](../../../docs/VALIDATION.md#3-row-count-accounting-4111-vs-4107) for the exact row-by-row accounting.

---

## Query Parameters

Fixtures are fetched using standard Horizons parameters:

- `CENTER = 'coord@301'` (Moon body-fixed coordinate frame)
- `COORD_TYPE = 'GEODETIC'`
- `SITE_COORD = '<east_lon>,<lat>,0'` (East longitude first, then latitude, altitude = 0 km on lunar reference ellipsoid)
- `QUANTITIES = '4'` (Apparent Azimuth and Elevation: Azimuth measured clockwise from North, 0–360°; Elevation relative to plane normal to local radius vector)
- `STEP_SIZE = '60 min'` (1-hour discrete cadence)
- `APPARENT = 'AIRLESS'` (No atmospheric refraction correction)
- `CSV_FORMAT = 'YES'`

---

## Regenerating Fixtures

Fixtures are committed directly to the git repository. If additional test points or epochs are required:

```bash
# Single site query
python pipeline/fetch_horizons_fixtures.py <name> <lat_deg> <east_lon_deg> <start_iso> <stop_iso>

# Batch mode (fetches defined validation suites not already present)
python pipeline/fetch_horizons_fixtures.py --batch
```

---

## Verification

To run offline verification against these fixtures:

```bash
pytest science/tests/test_api.py science/tests/test_api_v2.py
pytest science/tests/benchmark_horizons_all_rows.py
```
