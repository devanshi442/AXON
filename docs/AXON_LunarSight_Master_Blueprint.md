# AXON LunarSight — Master Blueprint
**CLPS Lunar Mission Browser · NASA Space Apps Challenge 2026**
Standalone reference: strategy, science method, data catalog, architecture, pipeline, plan, risks.

> **How to read the trust labels in this file**
> - **[Guide]** comes from your AXON Project Guide.
> - **[Research]** comes from the Gemini research report. File sizes, product IDs, URLs and news items are carried over as reported. **Re-verify each one against its source before you cite it in the demo or README.**
> - **[Design]** is the proposed architecture from this planning session.

---

## 1. Project summary

| Item | Detail |
|---|---|
| Challenge | CLPS Lunar Mission Browser (listed Intermediate/Advanced; Subjects: Human Exploration, Moon, Software, Space Exploration) |
| Goal | An intuitive tool that lets mission planners, educators and the public **compare landing sites and dates quickly**, visualizing **Sun and Earth positions relative to the local horizon** to judge **power-generation potential** and **direct-to-Earth (DTE) communication windows** |
| Why it is a strong pick | Geometry is deterministic and checkable against JPL Horizons; no messy data to clean; terrain data is compact [Guide][Research] |
| Hardest parts | Correct frames and time scales; terrain-aware horizon; a UI that is simpler than Moon Trek / LROC QuickMap |
| Motto | *Real sources. Clear calculations. Useful comparisons.* [Guide] |

### 1.1 Judging and submission context [Research]
- Judged on **Impact, Creativity, Validity, Relevance, Presentation**.
- Demo limit: a **30-second video or a 7-slide deck**. Plan the story to fit.
- Global awards named in the research include Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept. Target **Best Use of Science** (terrain-aware, Horizons-validated) and **Best Mission Concept** (engineering trade-off sliders).
- Confirm every rule and deadline on the official page: https://www.spaceappschallenge.org/2026/

### 1.2 Operational relevance [Research — verify]
The research cites a March 2026 NASA Moon Base announcement and late-2026 testing of a CLPS lander (Griffin-1). Check current NASA news before putting either in your pitch. As of late October 2026 the CLPS manifest may have changed from anything you read earlier.

---

## 2. Design principles [Design]

1. **Precompute first, compute on demand second.** Documented sites ship as static files, so the demo cannot break from a server outage. A small API serves arbitrary coordinates.
2. **One science engine.** All geometry lives in one Python package used by both the precompute job and the API.
3. **Provenance on everything.** Facts carry source URLs and a verified flag. Computed series carry kernel versions, frame, time scale, git SHA.
4. **Validate before decorating.** Horizons-matching geometry comes before the 3D Moon, scoring or any AI.
5. **Be honest about the horizon.** Flat-horizon results at the south pole are misleading (section 4.2).

---

## 3. Scientific background (why this problem is hard)

- The Moon's spin axis is tilted only about **1.54°** from the ecliptic normal. Near the south pole the Sun therefore stays within a few degrees of the horizon [Research].
- Earth is visible only from the near side. Libration makes Earth's apparent position wobble through a cycle of roughly 27 days, so at high southern latitudes Earth hovers near the horizon, dipping above and below it [Research].
- Result: a ridge or crater wall of modest height can cause weeks of darkness or cut the DTE line of sight. Terrain is not a refinement here; it decides the answer.
- Many CLPS sites are **not** polar (several target near-side mid-latitude regions). The high-resolution polar DEM only covers the south pole region, so the app needs a tiered terrain strategy (section 4.3).

### 3.1 Caveats from your Guide that must appear in the UI [Guide]
- Earth visibility is **not** guaranteed communication (antenna pointing, terrain, link budget, mission systems).
- Sun above the idealized horizon is **not** proof of illumination.
- Always document coordinate system, time scale, ephemeris source and calculation method.
- Do not invent scientific values; label placeholders; replace before the final demo.
- A public repo is not automatically permission to reuse code. Check licences.
- Moon Trek is a portal; its features are not automatically embeddable. Check services and terms.

---

## 4. Science method

### 4.1 Three-stage computation [Research, with [Design] additions]

**Stage A — Terrain horizon mask (precompute, per site).**
Ingest a polar stereographic LOLA DEM (heights relative to the 1737.4 km reference sphere). For a site at height `z0` (plus mast height `h`), step outward along each azimuth `φ` (0° to 359°, 1° steps) over distances `d` and compute the elevation angle to terrain, including lunar curvature drop:

```
θ_terrain(d, φ) = arctan( ( (z_d − (z0 + h)) − d² / (2·R_moon) ) / d )
θ_horizon(φ)    = max over d of θ_terrain(d, φ)
```

`R_moon = 1737.4 km`. Cap `d` at a documented distance (start around 20 to 50 km, limited by DEM coverage) and test sensitivity to that cap.

**Stage B — Ephemeris geometry (per time step).**
For each time `t`, compute topocentric azimuth/elevation of the Sun `(φ☉, θ☉)` and Earth `(φ⊕, θ⊕)` from the surface point. Primary method: **SPICE via SpiceyPy** in the Moon body-fixed frame. Cross-checks: JPL Horizons observer tables and an independent East-North-Up projection. Skyfield/Astropy are acceptable helpers, but your Guide notes Skyfield alone is not a complete lunar-surface solution.

**Stage C — Power and communication windows.**
- Sun usable when `θ☉(t) > θ_horizon(φ☉(t))`, with partial-disk handling across the solar angular radius `r☉ ≈ 0.266°`. Define a **visible fraction** `f☉` in `[0,1]` from how much of the disk clears the mask.
- DTE viable when `θ⊕(t) > θ_horizon(φ⊕(t)) + margin`, with a user-set antenna clearance margin.
- Illustrative power model (label as an assumption set, not a mission prediction):

```
P(t) = S · A · η · max(0, cos i) · f☉(t)
```

with solar constant `S ≈ 1361 W/m²`, array area `A`, efficiency `η`, and incidence angle `i` set by array orientation (vertical arrays are typical at the poles). Expose all of these as visible inputs.

### 4.2 Flat vs terrain horizon (the headline insight) [Design]
- **Level 1 (MVP):** flat horizon, geometric only, labelled "idealized, not terrain-aware".
- **Level 2 (target):** terrain horizon mask as above.
- UI payoff: polar "sky view" with the mask and the Sun/Earth tracks over it, plus a flat-vs-terrain toggle that shows how much the answer changes.

### 4.3 Tiered terrain strategy [Design, using [Research] datasets]
| Tier | Where | Terrain source | Label shown to user |
|---|---|---|---|
| T1 | Sites at about 80°S to pole | LOLA polar DEMs (5 to 40 m/px) | "Terrain-aware, high resolution" |
| T2 | Other sites | Global LOLA-derived DEM (about 16 to 64 ppd) from the SVS Moon Kit | "Terrain-aware, coarse; small features unresolved" |
| T3 | No terrain run | None | "Flat horizon only" |

### 4.4 Definitions to write down once and reuse
- Sun "up": use **upper limb** (center elevation + about 0.27°) or center. Pick one; show it.
- Earth "visible": center above the mask plus optional margin (default 0°).
- No atmospheric refraction on the Moon.
- Input and display time UTC; internal ephemeris time; leap seconds from the NAIF leap-seconds kernel.
- Longitude east-positive in −180 to 180; latitude planetocentric; use the mean-Earth/polar-axis lunar frame consistently (the convention LOLA and Horizons use). Do not mix with the principal-axis frame.
- Observer height `h` is a first-class parameter.

### 4.5 Event extraction [Design]
Sample every 30 to 60 minutes, detect sign changes of `elevation − mask`, refine by bisection to about 1 minute. Output rise/set intervals and summary stats: percent Sun-up, longest continuous sunlight, longest darkness, percent Earth-visible, longest Earth gap.

### 4.6 Validation (CI gate) [Design + Research]
| Test | Method | Pass criterion |
|---|---|---|
| Horizons golden tests | Topocentric lunar-surface observer in Horizons (keyless API; site-coordinate and elevation-cutoff options) for 5 to 10 sites and several dates; store as fixtures | Elevation/azimuth within a documented tolerance (start near 0.05°) |
| Self-consistency | SPICE routine vs own ENU projection | Negligible difference |
| Sanity | Polar Sun stays within a few degrees of horizon in flat mode; Sun cycle about 29.5 days elsewhere | Pass |
| Event refinement | Bisection vs dense sampling | Within 1 minute |
| Visual ground truth | Compare with NASA SVS south-pole lighting simulation frames (reported ID 4930: 2-hour steps, 2023 to 2030, south of 88°S) | Lit/dark patterns agree qualitatively around known ridges and shadowed regions |

Ship a **"Verify with JPL Horizons"** button that runs the same query live and shows the difference. This is the strongest Validity proof in a short demo.

---

## 5. Data catalog

### 5.1 Mission data (hand-curated) [Guide + Design]
Store in `data/missions.yaml`, validated in CI, compiled to JSON.

| Field | Notes |
|---|---|
| `id`, `name`, `provider`, `lander`, `task_order` | as named by NASA |
| `status` | planned, launched, landed, partial, failed, cancelled |
| `dates` | launch and landing, each with `precision` and `kind` (planned/actual) |
| `site` | name, lat, lon, `coord_kind` (planned/actual), `uncertainty_km`, region |
| `payloads[]` | name, org, purpose |
| `sources[]` | url, title, accessed_date, what it supports |
| `verified` | true only after a second member checks the source |

Rules: store planned and actual coordinates separately; use `null` for unknowns; start with 6 to 10 missions including at least one failed or partial; re-verify everything in the last two days before submission. Primary sources: https://www.nasa.gov/commercial-lunar-payload-services/ and https://www.nasa.gov/reference/commercial-lunar-payload-services/ plus provider press kits.

### 5.2 Terrain and rendering data [Research — verify sizes and IDs]
| Dataset | Use | Reported details | Access |
|---|---|---|---|
| LOLA South Pole GDR DEMs | Horizon masks | 87.5°S to pole at 5 m/px (about 163 MB JP2; 20 m version about 20 MB); 85°S to pole at 10 m/px (about 175 MB; 20 m about 60 MB; 40 m about 21 MB); 80°S to pole 20 m adjusted GeoTIFF with error, hillshade and roughness layers | https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE/ and https://pgda.gsfc.nasa.gov/products/90 (keyless) |
| SVS CGI Moon Kit (ID 4720) | Global terrain for T2, 3D textures | Displacement maps at 4, 16, 64 ppd (about 4 MB, 63 MB, 506 MB); LROC color textures | https://svs.gsfc.nasa.gov/4720 |
| SVS South Pole Lighting (ID 4930) | Visual validation | Pre-rendered lighting, 2023 to 2030, MP4/WebM about 17 to 72 MB per year | https://svs.gsfc.nasa.gov/4930/ |
| NASA Moon Trek | Base imagery, exploration | Portal; check tile services and terms before relying on it | https://trek.nasa.gov/moon/ |

### 5.3 Ephemeris and validation data
| Source | Use | Notes |
|---|---|---|
| NAIF SPICE kernels | Primary geometry | Planetary ephemeris (DE421 or DE440 class; about 114 MB for the larger file as reported), leap seconds, planetary constants, and high-accuracy lunar orientation PCK plus frame kernel. **Pin exact filenames and checksums in `kernels.lock`.** |
| JPL Horizons API | Golden tests and live verify button | https://ssd.jpl.nasa.gov/api/horizons.api (keyless; GET/POST; observer tables, site-coordinate override, elevation cutoff, CSV output). Docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html |
| CLPS SPICE archive (PDS) | Mission geometry for supported missions | Link in your Guide section 5 |

Python tools: spiceypy, astropy, skyfield (helper), astroquery.jplhorizons, rasterio, numpy, GDAL.

---

## 6. System architecture [Design]

```
OFFLINE (CI / local)
 Sources ──► missions.yaml ──► validate ──► missions.json, sites.json
 NAIF kernels ──► SCIENCE ENGINE (lunarsight_core) ──► timeseries/ events/ summary/
 LOLA / SVS DEM ──► horizon-mask builder ───────────►  horizon/
                         ▲
              Horizons golden tests (CI gate)
                         │ versioned static artifacts
                         ▼
RUNTIME
 CDN / static host                      FastAPI service (optional)
  • React SPA                            • /geometry for any lat/lon + mast height
  • missions/sites JSON                  • same science engine
  • precomputed series + masks           • disk/LRU cache
        ▲                                        ▲
        └──────────────── Browser ───────────────┘
   Explorer · Map · Compare · Timelines · Sky view · Trade-offs · Methods · Verify
```

**Degradation path:** if the API is down, every documented site still works from static files; only free-form "click anywhere" queries and the live Horizons check are disabled, and the UI says so.

### 6.1 Backend API
| Endpoint | Purpose |
|---|---|
| `GET /api/missions`, `/api/missions/{id}` | Mission data |
| `GET /api/sites`, `/api/sites/{id}` | Coordinates, terrain tier, mask availability |
| `POST /api/geometry/timeseries` | lat, lon, mast height, start, end, step, bodies, horizon mode; returns series + provenance |
| `GET /api/geometry/events` | Rise/set intervals and summary stats |
| `POST /api/power` | Illustrative power curve from array and efficiency inputs |
| `GET /api/compare` | Metrics for 2 to 4 sites over one range |
| `POST /api/verify` | Run the same query against Horizons and return the differences |
| `GET /api/provenance` | Kernel names, versions, git SHA, validation status |

Guardrails: cap date range and minimum step, validate lat/lon and mast height, structured errors, cache by request hash. Containerize with kernels baked in. Mitigate free-tier cold starts with a loading state plus static data.

### 6.2 Frontend
Stack: React + TypeScript + Vite, TanStack Query, Zustand, Tailwind; Plotly.js or ECharts for charts; Leaflet/MapLibre for maps; CesiumJS or Three.js for the optional 3D Moon.

| Screen | Contents |
|---|---|
| Explorer | Search, filters (provider, status, year, region), cards with verified badge and sources |
| Map | Global equirectangular view **and a south polar stereographic view** (equirectangular distorts the pole); planned vs actual markers |
| Site detail | Facts, payloads, sources, timelines |
| Timelines | Sun and Earth elevation vs time, shaded usable intervals, date brush, flat/terrain toggle |
| Sky view | Polar plot of horizon mask with Sun and Earth tracks |
| Trade-offs | **Mast/array height slider** (for example 1.5 m to 5 m) that live-updates power hours and DTE windows |
| Compare | 2 to 4 sites side by side: facts, stacked timelines, metrics, day-by-site calendar heatmap |
| Overlap finder | Rank windows (across a multi-year range such as 2026 to 2030) where Sun power and Earth visibility are both active |
| Methods | Sources, kernels, frame, time scale, definitions, validation table, limitations |
| Verify | One-click Horizons cross-check |

Quality bar: keyboard navigation, visible focus, colour-blind-safe palette (not red/green for Sun vs Earth), chart text alternatives plus data-table toggle, responsive layout, a "what this does not tell you" note on every timeline.

---

## 7. Differentiators for Best Use of Science / Best Mission Concept [Research + Design]

1. **Mast-height slider.** Raising an array or antenna from about 1.5 m to 5 m can lengthen usable sunlight or Earth visibility at grazing-light sites. Seeing it live speaks directly to payload-integration constraints.
2. **Multi-site synchronization matrix.** Evaluate 3 to 5 candidate sites over years and rank overlapping Sun-plus-Earth windows. The research names example south-polar regions (Shackleton connecting ridge, Malapert massif, Leibnitz Beta, Nobile rim); confirm coordinates and that each is relevant to documented CLPS plans before including them.
3. **Flat vs terrain toggle** that quantifies the error of the naive method.
4. **Horizons verify button** and a published validation table.
5. **Transparent site-characteristics breakdown** (only after validation): sun-up fraction, longest dark period, Earth-visible fraction, longest Earth gap, optional slope/roughness from the LOLA layers. Adjustable weights, no single magic score.

---

## 8. Pipeline

### 8.1 Build pipeline
```
1. fetch_kernels.py   → download pinned NAIF kernels, verify checksums
2. fetch_terrain.py   → download chosen LOLA / SVS DEM tiles, record versions
3. build_missions.py  → missions.yaml → validate → missions.json, sites.json
4. build_horizon.py   → DEM → per-site, per-mast-height horizon masks (JSON)
5. build_geometry.py  → site × date range → timeseries + events + summary
6. validate.py        → Horizons golden tests + sanity checks (fail build on error)
7. package.py         → compress, manifest.json with hashes and provenance
8. publish            → copy to web/public/data (or CDN)
```
Precompute scope suggestion: hourly samples, about 2024 to 2032 per documented site, events refined to about 1 minute, masks at 1° azimuth for a few mast heights.

### 8.2 Request pipeline
```
User picks site + dates (+ mast height)
 ├─ documented site → fetch precomputed JSON + mask → render
 └─ custom lat/lon  → POST /geometry/timeseries → cache check
                      → engine (mask from DEM tier if available) → render
UI always shows: source, frame, time scale, horizon mode, tier, limitations
```

### 8.3 CI/CD
GitHub Actions: lint and type-check, unit tests, Horizons golden tests (cached fixtures), build artifacts, build frontend, deploy frontend (for example Vercel), deploy API container (Render, Fly.io, Cloud Run or similar), preview deploys per pull request.

### 8.4 Repository layout
```
axon-lunarsight/
├─ data/       missions.yaml, sources.md, schema/
├─ science/    lunarsight_core/, tests/, fixtures/horizons/
├─ pipeline/   fetch_*.py, build_*.py, validate.py
├─ api/        FastAPI app, Dockerfile
├─ web/        React app, public/data/ (generated)
├─ docs/       METHODS.md, VALIDATION.md, LIMITATIONS.md, DEMO_SCRIPT.md
├─ kernels.lock
└─ README.md
```

---

## 9. Plan with cut lines

Your Guide's 7-day plan is a good skeleton. This version moves science validation earlier and defines what to cut. **For a 36 to 48 hour event, do phases 0 to 3 only, with Level 1 geometry and the Horizons verify.**

| Phase | Frontend (M1) | Visualization (M2) | Data/Science (M3) | Exit criterion |
|---|---|---|---|---|
| 0 Foundations | Repo, Vite app, design tokens | Map prototype | Kernels + terrain downloaded, SPICE prints first Sun elevation | Everyone can run the repo |
| 1 Data + Explorer | Cards, search, filters | 2D map with real markers | missions.yaml with 6 to 10 verified missions | Explorer shows real, cited data |
| 2 Geometry v1 | Timeline components | Map selection drives timeline | Flat-horizon engine, events, Horizons tests passing | Matches Horizons within tolerance |
| 3 Compare | Compare panel, Methods page | Polar stereographic view | `/compare`, static precompute pipeline | **MVP complete: stop-and-ship point** |
| 4 Terrain | Sky-view plot, flat/terrain toggle, mast slider | Mask rendering | Horizon masks, terrain-aware visibility, power model | Results sane vs SVS lighting frames |
| 5 Polish | Accessibility, responsive, errors | Optional 3D Moon | Overlap finder, LIMITATIONS.md | Lighthouse and axe clean |
| 6 Ship | Demo flow, slides | Demo video assets | Final fact re-verification | Deployed, README done, rehearsed twice |

**Cut order if behind:** 3D Moon, then overlap finder, then calendar heatmap, then terrain masks (keep flat mode with strong caveats). **Never cut:** sources, Methods page, validation table, limitations.

---

## 10. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Frame/time-scale error gives plausible but wrong angles | Medium | Horizons golden tests in CI; two independent methods |
| Terrain ray-casting eats the schedule | High | Phase 4; flat mode ships first; start with 20 m DEM |
| Non-polar sites lack high-res terrain | Certain | Tiered strategy and clear labels |
| Mission facts stale or wrong | Medium | `verified` flag, links, final re-check |
| API cold start or outage in demo | Medium | Static precompute for documented sites |
| Moon Trek tiles restricted | Medium | Self-hosted fallback base map from SVS textures |
| Reported file sizes/IDs/news in research are wrong | Medium | Verify at download time; do not cite unverified claims |
| Scope creep (3D, AI, scoring) | High | Cut order; MVP is stop-and-ship |
| Licence/attribution problems | Low-medium | Track in README; check repo and data terms |

---

## 11. Demo script (fits a 7-slide deck)

1. **Problem:** south-pole planning is hard and existing portals are complex.
2. **Solution:** one screen: mission map plus Sun/Earth timelines.
3. **Method:** ephemerides plus terrain horizon, in one diagram.
4. **Live demo:** pick two sites; flip flat vs terrain; drag mast height.
5. **Proof:** Horizons verify result and validation table.
6. **Honesty:** limitations (geometry is not a link budget; not a mission recommendation).
7. **Impact:** who uses it (planners, educators, public) and next steps.

For a 30-second video, combine slides 4 and 5 into the core and open with slide 1 in one sentence.

---

## 12. Submission checklist
- [ ] README: run instructions, architecture diagram, data sources, licences, credits
- [ ] Methods and validation pages live in the app
- [ ] Every mission record verified within the last two days
- [ ] Horizons verify works with the deployed build
- [ ] Rules and deadlines rechecked on the official challenge page
- [ ] Demo rehearsed twice with a fallback recording

## 13. Links
- Space Apps 2026: https://www.spaceappschallenge.org/2026/
- NASA CLPS: https://www.nasa.gov/commercial-lunar-payload-services/
- Moon Trek: https://trek.nasa.gov/moon/
- JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html · Manual: https://ssd.jpl.nasa.gov/horizons/manual.html
- NAIF SPICE: https://naif.jpl.nasa.gov/naif/
- CLPS SPICE (PDS): see Project Guide section 5
- SpiceyPy: https://spiceypy.readthedocs.io/ · Skyfield: https://rhodesmill.org/skyfield/ · Astropy: https://docs.astropy.org/
- LOLA polar DEMs: https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE/ · https://pgda.gsfc.nasa.gov/products/90
- SVS Moon Kit: https://svs.gsfc.nasa.gov/4720 · South Pole lighting: https://svs.gsfc.nasa.gov/4930/
