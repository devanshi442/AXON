# AXON LunarSight — Build Log

Decisions, assumptions, and open issues recorded chronologically.
Format: `## Phase N — YYYY-MM-DD`

---

## Phase 0 — 2026-10-21

### Decisions

**D-001: validate_missions.py output paths**
Original script wrote only to `web_public_data/missions.json` (root-level folder).
Blueprint §8.4 says generated files go to `web/public/data/`.
Resolution: updated the validator to write to **both** paths.
- `web_public_data/missions.json` — preserved for backward compat
- `web/public/data/missions.json` — where the React app expects it
`web/public/data/missions.json` is committed to git (needed for static hosting);
large generated subdirectories (timeseries/, events/, etc.) are in .gitignore.

**D-002: Colour-blind safe palette**
Blueprint rule 4 forbids red/green for Sun vs Earth.
Palette chosen:
- Sun → amber/gold (`#f59e0b`, Tailwind `sun-500`)
- Earth → cyan/teal (`#06b6d4`, Tailwind `earth-500`)
Both are distinguishable for deuteranopia, protanopia, and tritanopia.
Status colours also avoid red/green:
- success → blue, failed → violet, partial → amber, planned → gray.

**D-003: Default dark mode**
`<html class="dark">` is set by default; theme preference is persisted in localStorage via Zustand.

**D-004: Kernel filenames**
`fetch_kernels.py` lists these filenames (not yet network-verified):
- `naif0012.tls` → `lsk/naif0012.tls`
- `pck00011.tpc` → `pck/pck00011.tpc`
- `de440s.bsp` → `spk/planets/de440s.bsp`
- `moon_pa_de440_200625.bpc` → `pck/moon_pa_de440_200625.bpc`
- `moon_de440_250416.tf` → `fk/satellites/moon_de440_250416.tf`
DATA_README warns these were not network-tested. Marked all kernel-dependent
tests with `@pytest.mark.needs_kernels`.
**Action required:** run `python pipeline/fetch_kernels.py`, verify filenames at
https://naif.jpl.nasa.gov/pub/naif/generic_kernels/, paste SHA-256s into kernels.lock.

**D-005: Science package structure**
`science/` is an installable Python package (`pip install -e science/`).
`pyproject.toml` uses setuptools with `setuptools-scm` for version from git tags.

**D-006: `planned_site` field on im-2**
`data/missions.yaml` has an extra `planned_site: {lat: -84.78, lon: 29.13}` key.
The JSON schema doesn't use `additionalProperties: false`, so the validator passes.
The TypeScript type for `Mission` does not expose this field; it will be ignored at runtime.
If we need it later, we'll add it to both schema and types.

### Assumptions

**A-001:** The `needs-check-farside-and-schrodinger` mission ID passes the schema pattern
`^[a-z0-9-]+$` (only lowercase letters and hyphens).

**A-002:** `web/public/data/missions.json` is committed to git so the demo works without
running the API or the pipeline. Large precomputed files (timeseries, events, horizon masks)
are gitignored and must be regenerated locally.

### Open Issues

**OI-001:** Run `python pipeline/validate_missions.py` and confirm output at
`web/public/data/missions.json`. Required for Phase 1.

**OI-002:** Run `cd web && npm install && npm run dev` and confirm the app boots at
http://localhost:5173.

**OI-003:** Run `cd science && pytest tests/ -v` and confirm all constants tests pass
(8 tests, no kernels needed).

**OI-004:** SPICE kernels not yet downloaded. See D-004.

**OI-005:** All 8 missions have `verified: false`. A second reviewer must check each
source URL before submission.

**OI-006:** Coordinates for griffin-1, moon-base-1-endurance, im-3-reiner-gamma, and
needs-check-farside are null. These missions will show in the list but not on the map.

---

## Phase 1 to Phase 8 — 2026-10-24

### Decisions & Milestones

**D-007: Windows cp1252 Terminal Compatibility**
- `pipeline/validate_missions.py` encountered `UnicodeEncodeError: 'charmap'` when writing Unicode arrows on Windows default cp1252 consoles.
- Replaced non-ASCII arrows with ASCII `->` and explicitly enforced `encoding="utf-8"` on all file I/O.
- Validated all 8 missions and 2 reference sites against schema, compiling clean JSON to both `web/public/data/missions.json` and `web_public_data/missions.json`.

**D-008: SPICE Kernel Ingestion & Verification**
- Executed `pipeline/fetch_kernels.py` to retrieve the 5 NAIF SPICE kernels into `kernels/`:
  - `naif0012.tls` (Leap seconds)
  - `pck00011.tpc` (Planetary constants / radii)
  - `de440s.bsp` (Solar system ephemeris 1900–2050)
  - `moon_pa_de440_200625.bpc` (High-precision lunar orientation)
  - `moon_de440_250416.tf` (Lunar body-fixed frame definitions)
- Calculated SHA-256 hashes of all downloaded kernels; matched `kernels.lock` precisely.

**D-009: Science Engine Implementation (`lunarsight_core`)**
- Built `science/lunarsight_core/geometry.py`:
  - `load_kernels()` / `unload_kernels()` lifecycle management.
  - `site_to_enu()`: Converts planetocentric lat/lon and lunar radius (1737.4 km) to `MOON_ME` Cartesian coordinates and computes orthonormal East-North-Up basis vectors.
  - `compute_topocentric_az_el()`: Topocentric azimuth and geometric elevation with `LT+S` light-time and stellar aberration correction.
  - Sun upper limb correction: defined as geometric elevation + 0.267° (lunar semi-diameter of Sun).
  - `compute_site_timeseries()` & `compute_opportunities()`: Generates continuous hourly ephemerides and continuous intervals for Sun, Earth, and Joint visibility above configurable elevation thresholds.
- Validated against JPL Horizons golden test fixtures (`science/tests/test_geometry.py`). Error relative to JPL Horizons observer table is **< 0.00001°** (0.036 arcseconds), exceeding the 0.05° tolerance requirement by more than 1000x.
- Far-side verification: Verified Earth elevation from the lunar far side (0° N, 180° E) remains between -65° and -85° throughout 2026, confirming zero line-of-sight.

**D-010: Precomputation Pipeline (`build_geometry.py`)**
- Implemented `pipeline/build_geometry.py` generating full 2024–2028 hourly ephemerides (43,848 hours per site) for all sites with known coordinates:
  - `im-1` (Malapert A)
  - `blue-ghost-m1` (Mare Crisium)
  - `im-2` (Shackleton Connecting Ridge)
  - `mons-mouton-summit` (VIPER reference)
  - `malapert-crater` (South pole deep crater reference)
- Exported precomputed assets to `web/public/data/` and `web_public_data/`:
  - `timeseries/{site_id}.json`
  - `events/{site_id}.json`
  - `summary/{site_id}.json`
  - `manifest.json`

**D-011: FastAPI Backend (`api/main.py`)**
- Implemented FastAPI application with lifespan kernel management, CORS middleware, and Pydantic v2 schemas.
- Endpoints:
  - `GET /api/health`
  - `GET /api/provenance`
  - `POST /api/geometry/timeseries`
  - `POST /api/geometry/events`
  - `POST /api/compare`
- Added comprehensive unit tests in `science/tests/test_api.py`.

**D-012: Frontend Dashboard & Component Suite**
- Built responsive, accessible React + Vite + TypeScript dashboard adhering to Blueprint guidelines:
  - `web/src/stores/scenarioStore.ts`: Zustand store managing Scenario A/B selections, UTC timestamps, threshold slider, timeseries caching, nearest-hour interpolation, and 30-day opportunity window slicing.
  - `web/src/components/MoonMap.tsx`: 2D equirectangular lunar map with graticule lines (-90° to +90° lat, -180° to +180° lon), major maria approximations, interactive pins, distinct Amber (Scenario A) and Cyan (Scenario B) markers, and quick-set buttons.
  - `web/src/components/MissionExplorer.tsx`: Search bar, status filters (Planned, Success, Failure, Partial), honest verification badges (`Verified` vs `⚠️ Unverified (Pending 2nd review)`), coordinate confidence warnings, and Set A / Set B buttons.
  - `web/src/components/ScenarioPanel.tsx`: Date/time picker with +/-1h and +/-1d quick steppers, current Sun and Earth elevation cards, azimuth, above/below horizon badges, and horizontal bar diagrams.
  - `web/src/components/OpportunityTimeline.tsx`: Elevation threshold slider (0° to 25°, default 5.0°), 30-day Sun/Earth/Joint timeline bars (720 hourly segments), and contiguous interval duration tables.
  - `web/src/components/ComparisonPanel.tsx`: Side-by-side comparison between Scenario A and Scenario B with exact arithmetic difference ($B - A$).
  - `web/src/pages/MethodsPage.tsx`: Detailed science documentation, conventions, JPL Horizons benchmark comparison table, SHA-256 kernel checksums, and explicit scientific limitations.
- Added ESLint configuration (`web/.eslintrc.cjs`) and unit tests (`web/tests/scenario.test.ts`).

**D-013: Problem Statement Realignment & Educational Framing**
- Realigned UX terminology directly with updated challenge requirements:
  - Solar illumination metrics labeled as **"Solar Power Generation Potential (Sun)"**.
  - Earth line-of-sight metrics labeled as **"Direct-to-Earth (DTE) Communication Windows (Earth)"**.
  - Added dedicated **"🏔️ South Pole Focus"** filter to isolate polar target missions (`im-1`, `im-2`, `mons-mouton-summit`, `malapert-crater`).
  - Added visual **South Pole Polar Target Band (< -70°)** boundary and annotation to the 2D Moon Map.
  - Added collapsible Educational Guide Card: *"Why the Moon's South Pole? — Extreme Lighting & Communication Constraints"* explaining the Moon's 1.54° axial tilt, 27.3-day libration cycle, and the joint power/comm operational constraint for mission planners, educators, and the public.

### Test Results
- **Python Unit Tests:** 17 passed in 1.92s (`pytest science/tests/ -v`).
- **Frontend Unit Tests:** 4 passed in 1.10s (`npm test` via tsx).
- **TypeScript Type Check:** 0 errors (`npm run type-check`).
- **ESLint:** 0 errors/warnings (`npm run lint`).
- **Vite Production Build:** Successfully built bundle in 2.79s (`npm run build`).

### Scientific Caveats & Honest Disclosures
- Idealized smooth spherical horizon only ($r = 1737.4\text{ km}$); local topographic shadowing from crater rims and mountains is not included.
- Earth visibility represents pure geometric line-of-sight to Earth's center, not a communication link budget.
- Records without published coordinates (`griffin-1`, `moon-base-1-endurance`, `im-3-reiner-gamma`, `needs-check-farside-and-schrodinger`) have disabled scenario buttons and are omitted from map plotting to avoid fabricating coordinates.
- All mission records display unverified status badges until second independent review.
