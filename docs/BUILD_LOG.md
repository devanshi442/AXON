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

*Next: Phase 1 — Data + Explorer (start after checkpoint confirmation)*
