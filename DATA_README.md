# AXON LunarSight data pack (compiled 2026-10-21)

## What is in here
- data/missions.yaml : 8 mission records + 2 reference sites, every field cited, all verified:false
- data/schema/missions.schema.json : JSON Schema used by CI
- pipeline/validate_missions.py : validates the YAML, compiles web_public_data/missions.json
- pipeline/fetch_kernels.py : NAIF kernels (verify filenames at naif.jpl.nasa.gov first)
- pipeline/fetch_horizons_fixtures.py : Horizons golden-test fixtures per site
- pipeline/fetch_terrain.py : download a LOLA DEM by URL
Setup: pip install -r requirements.txt, then python pipeline/validate_missions.py

## Coordinate confidence
- IM-1 (-80.13, 1.44, 2579 m): NASA LRO page + EGU paper. Strong.
- IM-2 (-84.7906, 29.1957): Wikipedia only; LROC intended site -84.78, 29.13. Replace with an LROC/NASA actual.
- Blue Ghost 1 (18.56, 61.81): LROC landing-region box center, not exact touchdown (LROC says about 19 N, 62 E).
- Griffin-1, Endurance, IM-3, far-side: coordinates null. Needs research.

## Team to-do (data owner)
1. Second person re-checks each record against its source, then flip verified to true.
2. Find coordinates for Griffin-1 target, IM-3 Reiner Gamma, Endurance.
3. Resolve far-side/Schrodinger status.
4. Re-check statuses 1-2 days before submission (Moon Base rebranding, launch slips).
5. Note: "Leibnitz Beta" in the Gemini report is the old name of Mons Mouton.
6. Scripts that call NAIF/Horizons/PDS were not network-tested in my environment.
