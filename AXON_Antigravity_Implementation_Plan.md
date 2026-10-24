# AXON LunarSight — Antigravity Implementation Plan

> **Purpose:** Give this file to Antigravity IDE while the existing AXON LunarSight repository is open. Read this plan and the repository first, then implement the changes in the existing codebase. Do not merely produce another plan or rewrite the repository from scratch.
>
> **Inputs:** The open repository is the implementation source of truth. `AXON_LunarSight_Guidebook_v2.pdf` is the product/feature reference. The repository's `docs/AXON_LunarSight_Master_Blueprint.md`, `docs/BUILD_LOG.md`, README, schema, and science conventions provide additional architecture context where present.

---

## 1. Mission and desired outcome

Turn the current AXON LunarSight foundation into a working CLPS Lunar Mission Browser that lets users:

1. Search and filter cited CLPS mission records.
2. Select two missions/sites (Scenario A and Scenario B) from a Moon map or the explorer.
3. Choose a UTC date/time for each scenario and a minimum useful elevation threshold.
4. Inspect the geometric elevation of the Sun and Earth above/below the local idealized horizon.
5. See the next 30 days of sunlight and Earth-visibility opportunity, including interval/window lists.
6. Compare A and B side by side, including differences and hours when the Sun and/or Earth meet the threshold.
7. See sources, verification state, conventions, provenance, and limitations clearly.

Build this by **extending the current repository architecture**, not by replacing it with the vanilla TypeScript structure in the PDF.

### Definition of success

The app builds and runs from the existing `web/` app; mission data follows the current schema and is not invented; the science pipeline has reproducible inputs and validation; the main explorer/scenario/timeline/compare flow works end to end for supported data; tests cover important behavior; and documentation describes what is genuinely implemented versus planned.

---

## 2. Architecture decisions (important)

### Preserve the current architecture

The repository already separates concerns:

- `data/`: mission YAML and its JSON Schema.
- `pipeline/`: fetching kernels/terrain, compiling mission data, building geometry and validation.
- `science/lunarsight_core/`: reusable scientific logic and conventions.
- `science/tests/` and `science/fixtures/`: test suite and Horizons fixtures.
- `web/`: React + TypeScript + Vite + Tailwind frontend.
- `api/`: FastAPI service, currently a stub.
- `docs/`: blueprint, build log, methods, validation and limitations.

Keep these boundaries. Do not copy the PDF's `src/main.ts`, `src/explorer.ts`, `src/scenarios.ts` architecture into the repository root. Translate its intended behavior into React components, hooks/services, existing stores and the current Python package.

### Static-first, API-capable design

Use a hybrid design consistent with the repository blueprint:

1. **Build time:** compile mission data, compute geometry for supported/documented sites where inputs and kernels exist, validate results, and emit versioned JSON artifacts plus a provenance manifest.
2. **Browser runtime:** load static mission and geometry artifacts for documented sites; render and interpolate only within known coverage.
3. **API runtime:** support custom latitude/longitude/time queries only through a real, tested geometry implementation. Keep the API optional for the basic static-site experience.

Do not make the UI depend on the API for ordinary documented-site browsing. Do not pretend custom-site queries work until the complete path is implemented and tested.

### Resolve conflicting or stale documentation safely

- Inspect the actual files and existing code before editing; filenames mentioned in documentation may be missing or renamed.
- Use the repository's current mission schema and science conventions as the default contract.
- Use the PDF for user-facing functionality and acceptance criteria, not as a reason to downgrade the React architecture.
- Where the repository blueprint is more ambitious than the PDF (terrain, custom coordinates, wider date coverage), prioritize a scientifically honest MVP first. Implement only what can be completed and validated, and document the remaining work.
- Do not delete or overwrite user work, existing mission facts, fixtures, or generated assets without understanding their role.

---

## 3. Non-negotiable science and data integrity rules

1. **Never fabricate mission facts, coordinates, sources, elevations, events or validation outcomes.** Unknown/unpublished coordinates remain `null`; missions with null coordinates must not be plotted as though they had a real location.
2. Do not change a mission's `verified` flag from `false` to `true` automatically. It requires an actual source review by a human as described in `DATA_README.md`.
3. Keep the mission YAML as the authoritative source. `missions.json` is generated output, not a separate hand-maintained source of truth. Inspect the existing scripts and current paths; resolve duplicate-output paths by updating all consumers or making any compatibility copy generated explicitly.
4. Follow the repository's `web/src/constants/scienceConventions.ts` and matching Python constants. Keep them synchronized. Current conventions include UTC input/display, ET internally using the NAIF leap-seconds kernel, east-positive longitude in `[-180, 180]`, planetocentric latitude, `MOON_ME` frame, lunar reference radius 1737.4 km, no atmospheric refraction, Sun upper-limb correction of +0.267° for the Sun-up convention, and the `LT+S` light-time/stellar-aberration correction where supported by the science implementation.
5. Keep the UI distinction explicit: geometric Sun elevation is not proof of usable ground illumination; geometric Earth elevation is not a communication/link-budget guarantee; the horizon is idealized unless a tested terrain mask is applied.
6. Do not silently extrapolate outside geometry coverage. Return a clear unsupported-range message or use a tested API calculation.
7. Network-based validation must not make the default test suite flaky. Use stored golden fixtures for regular tests and keep live fetching in explicit scripts.
8. Preserve kernel checksum verification through `kernels.lock`; do not commit large downloaded kernels or terrain files unless the repository's current policy explicitly changes.
9. Do not claim terrain-aware results merely because `fetch_terrain.py` or Rasterio exists. The UI must identify the actual horizon mode used for a result.
10. Do not make external requests or expose untrusted input directly to SPICE or filesystem paths. Validate latitude, longitude, date range and requested sampling before calculation.

---

## 4. First task: audit before implementation

Before coding, inspect these areas and record findings in `docs/BUILD_LOG.md`:

- Root `README.md`, `DATA_README.md`, `docs/AXON_LunarSight_Master_Blueprint.md`, `docs/BUILD_LOG.md`, `docs/METHODS.md`/equivalent, `docs/VALIDATION.md`/equivalent and `docs/LIMITATIONS.md`/equivalent.
- `data/missions.yaml`, `data/schema/missions.schema.json`, `pipeline/validate_missions.py` and all current mission JSON outputs.
- All files under `science/lunarsight_core/`, `science/tests/`, and `science/fixtures/horizons/`.
- `pipeline/build_geometry.py` and related scripts if present; confirm whether the current tree actually contains a working geometry builder or only a planned entry in docs.
- `api/main.py`, `api/requirements.txt` and any API tests.
- `web/package.json`, Vite/TypeScript/Tailwind configuration, `web/src/App.tsx`, `web/src/components/Layout.tsx`, pages, stores, types, styles and `web/public/data/`.
- Existing assets and deployment configuration. Do not assume the PDF's `moon.jpg` or GitHub Pages workflow is already present.

Then run the current checks before changing code, if dependencies are available. Record baseline failures separately from failures introduced by changes. If a check cannot run because kernels or packages are absent, say so and continue with tests that do not require them.

---

## 5. Target architecture and responsibilities

### Data/science build path

```text
 data/missions.yaml + data/schema/missions.schema.json
                     |
                     v
          pipeline/validate_missions.py
                     |
                     v
          web/public/data/missions.json

 kernels/ + site coordinates + date coverage
                     |
                     v
      science/lunarsight_core/ geometry engine
                     |
                     v
         pipeline/build_geometry.py
                     |
                     v
 timeseries/ + events/ + summaries/ + manifest/provenance
                     |
                     v
           validation against fixtures
```

Use current project naming when it differs, but make the path from source input to generated artifact clear and repeatable. Generated artifact schemas should be versioned and documented.

### Frontend runtime path

```text
React app
  |-- mission data service ------------------> missions.json
  |-- geometry data service -----------------> precomputed timeseries/events/summary
  |-- documented site + supported dates ----> local lookup/interpolation
  |-- custom coordinates (if API is ready) --> FastAPI -> validated science engine/cache
  |-- scenario state ------------------------> gauges, timelines, comparison and map markers
```

The displayed values in the gauges, timeline, availability windows and comparison must all come from the same selected site, UTC time, threshold and geometry source. Avoid separate calculations in different components that can disagree.

### Suggested React components (adapt to existing naming)

- `ExplorerPage`: main page composition and data-loading/error states.
- `MissionExplorer`: search, filters, cards, sources, verified badge, “Set as A/B”.
- `MoonMap`: mission markers, coordinate graticule, selection state, legend, popups.
- `ScenarioPanel`: scenario A or B, mission/site selector, UTC date-time control, threshold control.
- `ElevationGauge` or `HorizonDiagram`: Sun/Earth elevation and above/below-horizon explanation.
- `OpportunityTimeline`: 30-day Sun/Earth bars and intervals/windows.
- `ComparisonPanel`: table of A/B/current elevation, availability hours/percentages, differences and joint availability.
- `MethodsPage`/`SourcesAndLimitations`: conventions, provenance, sources, data verification and horizon mode.

Create components only where they improve separation. Use the repository's existing theme/layout and stores rather than adding a second styling/state architecture.

---

## 6. Implementation phases

Execute the phases in order. At the end of each phase, run the relevant tests/build, fix regressions and update `docs/BUILD_LOG.md`. Do not leave the repository in a broken intermediate state.

### Phase 0 — Baseline and contracts

1. Inventory existing implementation and tests (Section 4).
2. Define or confirm TypeScript mission and geometry types based on the existing JSON schema.
3. Define a single geometry-artifact contract shared by Python, API and TypeScript. At minimum it must identify:
   - schema/data version;
   - site or coordinate identity;
   - start/end UTC and sample interval;
   - Sun and Earth elevation arrays with explicit units;
   - generated timestamp, kernel identifiers/hashes and frame/time conventions;
   - horizon mode (`idealized` or a named terrain mask/tier);
   - provenance/validation status.
4. Document API request/response models if they do not already exist.
5. Preserve the current working theme and navigation.

**Acceptance:** baseline results and known gaps are documented; type/data contracts are explicit; existing mission schema remains valid.

### Phase 1 — Mission data pipeline and integrity

1. Ensure `pipeline/validate_missions.py` validates against the current JSON Schema and reports actionable errors with mission IDs and fields.
2. Ensure it generates the JSON consumed by `web/` deterministically, without manually editing compiled JSON.
3. Preserve unknown fields as null/unknown according to the schema; do not invent map coordinates.
4. Expose useful source links, mission status, provider, lander, dates, site, payload highlights, coordinate kind/confidence and `verified` status to the UI.
5. Handle `planned`, failed, partially successful, unknown and unverified missions without presenting them as equivalent.
6. Resolve and document duplicate generated data paths (`web/public/data/missions.json` versus `web_public_data/missions.json`) so that only one is authoritative.

**Acceptance:** validation succeeds on the current intended data; generated JSON is deterministic; unverified records remain visibly unverified; unknown sites are not plotted at fake coordinates.

### Phase 2 — Science geometry engine and reproducible precomputation

1. Inspect `science/lunarsight_core/` and `pipeline/build_geometry.py`. Reuse sound existing calculations. If the builder is missing or incomplete, implement the minimum tested path in the existing structure rather than creating a competing engine.
2. Use SPICE to calculate site-to-Sun and site-to-Earth geometry in the documented lunar body-fixed frame. Apply the repository's frame, time scale, radius, correction and sign conventions consistently.
3. Validate input coordinates and kernel availability. Fail with a clear actionable message if required kernels are missing or incompatible.
4. Generate a documented time-series artifact for known sites over a configurable date range. The first functional slice should cover at least 2026–2028 to satisfy the PDF's MVP; retain the repository blueprint's broader range as a configuration/extension when practical. Never label a date as covered unless its data exists or a tested API path can compute it.
5. Generate opportunity intervals/events and summary statistics from the same time series. Avoid inconsistent duplicated calculation logic.
6. Add a manifest with generation time, coverage, schema version, kernel filenames/hashes, frame/time conventions, site ID/coordinates, horizon mode and validation metadata.
7. Store a documented sample interval. If hourly samples are used, explain that boundary/event times have at most hourly resolution unless a tested refinement step is implemented.
8. Add offline tests for coordinate conversion, elevation range/sign, time-index lookup, interpolation bounds, interval generation, missing values and far-side Earth-visibility edge cases.
9. Use the stored Horizons fixtures and Apollo reference checks where applicable. Do not make standard tests depend on a live Horizons request.

**Acceptance:** a clean command sequence can generate the documented artifacts; tests detect missing samples and out-of-range times; geometry results include provenance and honest horizon labels; the UI can use the outputs without calculating its own independent geometry.

### Phase 3 — FastAPI endpoints and consistent contracts

Keep the API optional for static browsing. Implement only endpoints that are fully backed by tested behavior:

- `GET /api/health`: real service health/version.
- `GET /api/provenance`: current kernel/artifact/frame/time/horizon metadata; do not return placeholder text once real metadata is available.
- `POST /api/geometry/timeseries`: custom coordinates/date-range request if the science engine supports it.
- `GET /api/geometry/events`: events for a supported site/range if implemented.
- `GET /api/compare`: comparison derived from the same geometry/artifact contracts if implemented.
- `POST /api/verify`: only if the intended validation use case and response schema are well-defined; otherwise leave it out and document why.

Requirements:

1. Validate latitude (−90 to 90), longitude (normalize/document the east-positive convention), requested times, sampling interval and request size.
2. Return typed responses and meaningful 4xx/5xx errors; no uncaught tracebacks sent as normal payloads.
3. Add CORS settings appropriate to local development and the actual deployed frontend; avoid permissive wildcard production settings without reason.
4. Add tests for valid input, invalid coordinates/dates, missing kernels, range limits, and consistent response schema.
5. Add caching only after request identity and cache-key inputs (coordinates, time range, interval, kernels, horizon mode, engine/schema version) are explicit.

**Acceptance:** endpoint behavior is documented and tested. If the science path is not ready, clearly report the endpoint as not implemented rather than returning mock elevations.

### Phase 4 — Mission explorer and Moon map

1. Replace the Phase 0 Explorer placeholder with the actual application shell and mission explorer.
2. Add searchable/filterable cards for name, provider, lander, status, region/site and payload where present.
3. Show source links and verification/coordinate-confidence indicators on each relevant card and popup.
4. Add “Set as A” and “Set as B” actions.
5. Add a 2D lunar map with graticule, legend and selectable markers. Marker states distinguish A, B, A+B and unselected sites.
6. Only put records with valid published/selected coordinates on the map. Make planned/approximate region centers visually distinct from actual touchdown coordinates.
7. Use the existing map dependency if available. Otherwise add a compatible Leaflet dependency to `web/` only after checking current package versions. Do not install unrelated UI frameworks.
8. Check for a licensed/credited Moon map asset in the repository. If absent, either add a properly sourced and credited asset or implement a clearly labelled temporary map fallback; do not silently use an uncredited external image.
9. Map clicks must update the selected scenario. Explorer/map must share the same selection state.

**Acceptance:** searching by provider finds matching records; setting a card or marker as A/B changes the correct scenario; missing coordinates never become fake markers; mobile layout remains usable.

### Phase 5 — Scenarios, date/time and elevation visualizers

1. Build Scenario A and B panels with mission/site selector and UTC date-time input.
2. Add a minimum-useful-elevation threshold slider (default 5° unless existing configuration defines another documented default).
3. Display Sun and Earth elevation in degrees, positive/negative sign, above/below-horizon status and a simple horizon diagram.
4. Explain the meaning in plain English; make clear that Sun elevation is not the same as available power and Earth visibility is not a link-budget guarantee.
5. Recalculate/refresh every dependent UI from the same selected scenario state: current values, gauges, timeline/window list and comparison.
6. Show loading, no-data, unsupported range, unavailable coordinates and calculation errors as helpful states rather than crashes or zero-valued results.
7. Use UTC explicitly in labels and parsing; prevent browser-local timezone conversion from silently shifting the requested time.

**Acceptance:** changing mission, coordinates or UTC date/time updates the values everywhere consistently; a missing or out-of-range value is clearly labelled and not represented as 0°.

### Phase 6 — 30-day opportunity timelines and window lists

1. Draw a 30-day Sun opportunity bar and Earth-visibility bar per scenario using the available time series.
2. Use the selected elevation threshold consistently (including the repository's Sun upper-limb convention where applicable).
3. List each contiguous interval/window above threshold with start, end and duration in UTC.
4. Add “Sun AND Earth both available” intervals/hours derived from the intersection of the two availability masks. Do not confuse this with a true power or communications recommendation.
5. If the available sample interval is hourly, label the precision accordingly. Only add sub-sample event refinement if implemented and validated.
6. Far-side sites must not show Earth-visibility windows if the geometry confirms Earth remains below the idealized horizon; add a test for this case.
7. When a requested 30-day window crosses data coverage, show the covered span and unsupported span clearly; do not render unavailable values as dark/false bars without explanation.

**Acceptance:** timeline bars and listed windows agree with the same source data; changing the threshold changes both; far-side and missing-data behavior is correct.

### Phase 7 — Side-by-side comparison, methods and provenance

1. Provide an A/B comparison table with current Sun elevation, current Earth elevation, differences (B − A), Sun-above-threshold hours/percentage, Earth-above-threshold hours/percentage and joint availability hours where supported.
2. Label which units and time period each metric covers. Do not compare inconsistent ranges or sample intervals.
3. Add a Methods page using `web/src/constants/scienceConventions.ts` as the UI source of truth and keep it synchronized with Python constants. Include frame, time scale, longitude sign, reference radius, Sun upper-limb convention, horizon mode, correction model and supported date range.
4. Display links to mission sources and the mission's `verified` state. Explain that the flag means a second review has occurred; do not make it a generic confidence score.
5. Surface generation timestamp, kernel hashes/IDs, artifact coverage and validation status from the manifest when available.
6. Keep a concise, visible limitations section, not hidden only in docs.

**Acceptance:** comparison differences agree arithmetically with displayed A/B values; hours/percentages specify their range and threshold; the Methods page matches the calculation configuration used at runtime.

### Phase 8 — Quality, CI, deployment and documentation

1. Add or repair frontend tests using the repository's existing test framework. If no frontend test framework exists, select a compatible lightweight one and configure it without replacing the stack.
2. Add tests for mission filtering/selection, scenario state, UTC handling, interpolation bounds, windows, comparison arithmetic and no-data cases.
3. Run Python tests, frontend tests, typecheck and production build. Add CI workflow steps only when they can run reliably without downloading huge SPICE kernels or relying on live network calls.
4. Preserve the `web/` app as a deployable static frontend. If adding a backend deployment, document it separately; GitHub Pages cannot host the FastAPI process itself.
5. Check the Vite base path and asset URLs for the intended static hosting target. Do not copy the PDF's root-level deployment config without adapting it to the `web/` subdirectory.
6. Update root README and docs with actual commands, outputs, supported date coverage, known gaps and a clear distinction between working, partially working and planned features.
7. Update `docs/BUILD_LOG.md` at the end of every phase. Add a final section listing changed files, commands run, tests passed/failed and remaining blockers.

**Acceptance:** clean frontend production build and available tests pass; docs match the actual directory structure and commands; deployment instructions reflect the chosen hosting arrangement.

---

## 7. Required user-facing features and acceptance checklist

Use this checklist as the final end-to-end review (derived from the PDF feature table and test plan, adapted to the current React architecture):

- [ ] Mission search and filters work for real mission fields.
- [ ] Mission cards contain provider, lander, status, location, payload/source details when known, and an honest verification badge.
- [ ] “Set as A/B” works from the explorer and map.
- [ ] Moon map includes a graticule, useful legend and coordinate-aware markers.
- [ ] UTC date/time controls exist for both scenarios.
- [ ] Sun and Earth elevations show degree values and above/below-horizon state.
- [ ] Elevation explanations and visualizers reflect the current scenario.
- [ ] Threshold slider affects the timelines, windows and availability comparison consistently.
- [ ] Thirty-day timelines and interval lists are generated from the actual geometry data.
- [ ] Far-side Earth visibility follows the geometry and has a regression test.
- [ ] Side-by-side comparison reports correct B − A differences and clearly scoped availability hours.
- [ ] Combined Sun AND Earth availability is shown only where its meaning and time range are clear.
- [ ] Missing coordinates, unverified facts, unsupported dates and missing geometry are handled honestly.
- [ ] Methods, sources, conventions and limitations are discoverable in the app.
- [ ] No terrain-aware claim is shown for an idealized-horizon result.
- [ ] Python tests and frontend tests/build run; any environment-dependent skipped tests are documented.
- [ ] README, data README, API docs and build log match the implementation.

---

## 8. UI/UX direction

Use the existing dark space-themed visual language from `web/src/components/Layout.tsx` and `web/src/index.css` (inspect actual files before modifying). Keep the hierarchy close to the PDF's page 34–36 concept:

1. Header and app identity.
2. Mission explorer beside the Moon map on wide screens; stacked layout on narrow screens.
3. Two scenario panels with synchronized selection and time controls.
4. Sun/Earth gauges and 30-day timelines/window lists.
5. Comparison table.
6. Sources, methods and limitations.

Use clear labels and meaningful empty/loading/error states. Preserve keyboard navigation, focus visibility, reasonable contrast and responsive layout. Avoid decorative complexity that makes the science harder to inspect.

---

## 9. Implementation workflow for Antigravity

1. Read this entire file and inspect the actual workspace. Do not assume the PDF's example file layout exists in the repo.
2. Write a short task checklist to `docs/BUILD_LOG.md` or a dedicated implementation tracker, then begin making code changes immediately.
3. Complete the smallest end-to-end vertical slice first: load missions → choose A/B → select UTC time → load/compute geometry → display elevation. Only then expand to timelines and comparison.
4. Work phase by phase and keep the application buildable after each phase.
5. Before adding dependencies, inspect `web/package.json` and use compatible packages already installed where possible.
6. Avoid giant rewrites. Use incremental, reviewable edits that preserve existing structure and useful work.
7. After changes, run the commands appropriate to the repo, likely:

   ```bash
   # From repository root
   python pipeline/validate_missions.py
   pytest science/tests/ -v

   # Frontend
   cd web
   npm install   # only when dependencies/package manifest changed
   npm run build
   # Run the configured frontend test command if present
   ```

   If a command does not exist in the actual package scripts, inspect `web/package.json` and use the configured equivalent rather than inventing a command.
8. Inspect the final diff for accidental deletions, duplicated implementations, untracked generated binaries, secrets and unsupported scientific claims.
9. Finish by summarizing implemented work, files changed, tests executed and passed, tests not run, and remaining gaps. Do not report features as complete unless the acceptance criteria actually pass.

### Priority if time is limited

**P0:** validated mission loading; usable explorer; A/B selection; UTC time; scientifically honest Sun/Earth elevation; Methods/limitations; passing build/tests.

**P1:** Moon map; 30-day timelines and interval lists; comparison metrics and joint availability.

**P2:** fully deployed custom-coordinate API, terrain-aware horizon masks, high-resolution event refinement, expanded data coverage and advanced mapping.

Do not sacrifice the correctness of P0 science and data handling to create a visually impressive but misleading demo.

---

## 10. Final instruction

**Implement the features in this plan inside the existing repository.** Treat the PDF as a behavior and product reference, not a folder structure to copy. Preserve React + Vite + TypeScript + Tailwind, the Python science package, existing mission schema and test fixtures. First determine what is already implemented, fill the gaps, validate scientific behavior, and update the documentation. If any feature cannot honestly be completed because a kernel, asset, coordinate, source or reliable calculation is unavailable, leave a clear non-misleading UI state and document the blocker instead of fabricating a result.
