# AXON LunarSight data pack (compiled 2026-10-21)

## What is in here
- data/missions.yaml : 8 mission records + 2 reference sites, every field cited, all verified:false
- data/schema/missions.schema.json : JSON Schema used by CI
- pipeline/validate_missions.py : validates the YAML, compiles web_public_data/missions.json
- pipeline/fetch_kernels.py : NAIF kernels fetcher (all 5 kernels downloaded & verified against kernels.lock)
- pipeline/build_geometry.py : builds 2024–2028 hourly ephemerides, opportunities, and manifest into web/public/data/
- pipeline/fetch_horizons_fixtures.py : Horizons golden-test fixtures per site
- pipeline/fetch_terrain.py : download a LOLA DEM by URL
Setup: pip install -r requirements.txt, then python pipeline/validate_missions.py && python pipeline/build_geometry.py

## Coordinate confidence & Integrity
- IM-1 (-80.13, 1.44, 2579 m): NASA LRO page + EGU paper. Strong.
- IM-2 (-84.7906, 29.1957): Wikipedia only; LROC intended site -84.78, 29.13. Secondary source disclaimer displayed in UI.
- Blue Ghost 1 (18.56, 61.81): LROC landing-region box center, not exact touchdown.
- Griffin-1, Endurance, IM-3, far-side: coordinates null. Never fabricated; buttons are disabled and sites are omitted from map.

## Team to-do (data owner)
1. Second person re-checks each record against its source, then flip verified to true.
2. Find coordinates for Griffin-1 target, IM-3 Reiner Gamma, Endurance when officially announced.
3. Resolve far-side/Schrodinger status.
4. Re-check statuses 1-2 days before submission (Moon Base rebranding, launch slips).
5. Note: "Leibnitz Beta" in the Gemini report is the historical name of Mons Mouton.
