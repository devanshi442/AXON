import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import type { MissionsData, SelectableSite, CoordKind, TerrainTier } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'
import type { SolarOrientation, EarthCriterion } from '../utils/scienceMath'
import MoonMap from '../components/MoonMap'
import MissionExplorer from '../components/MissionExplorer'
import ScenarioPanel from '../components/ScenarioPanel'
import OpportunityTimeline from '../components/OpportunityTimeline'
import ComparisonPanel from '../components/ComparisonPanel'
import PanelCornerBrackets from '../components/PanelCornerBrackets'

const LunarGlobe = lazy(() => import('../components/LunarGlobe'))

const MAST_HEIGHTS = [0.0, 1.5, 3.0, 5.0, 10.0]
const WINDOW_DAY_OPTIONS = [7, 14, 30, 60, 90]

export default function ExplorerPage() {
  const [missionsData, setMissionsData] = useState<MissionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEducationalCard, setShowEducationalCard] = useState(false)
  const [mapViewMode, setMapViewMode] = useState<'globe' | 'flat'>('globe')
  const [showAdvancedPhysics, setShowAdvancedPhysics] = useState(false)
  const [flashA, setFlashA] = useState(false)
  const [flashB, setFlashB] = useState(false)
  const [showJumpChip, setShowJumpChip] = useState(false)

  // Unified Selected Location Bar state: populated whenever the user clicks a
  // pin or an empty surface point on EITHER the 3D Globe or the flat 2D Map.
  const [selectedLocation, setSelectedLocation] = useState<
    | { kind: 'site'; site: SelectableSite }
    | { kind: 'coords'; lat: number; lon: number }
    | null
  >(null)

  const comparisonRef = useRef<HTMLDivElement>(null)

  const {
    scenarioAId,
    scenarioBId,
    setScenarioA,
    setScenarioB,
    loadTimeseries,
    loadHorizon,
    horizonMode,
    setHorizonMode,
    mastHeightM,
    setMastHeightM,
    windowDays,
    setWindowDays,
    thresholdDeg,
    setThresholdDeg,
    dteMarginDeg,
    setDteMarginDeg,
    earthCriterion,
    setEarthCriterion,
    solarArrayType,
    setSolarArrayType,
    setPickedCoords,
  } = useScenarioStore()

  useEffect(() => {
    fetch('/data/missions.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`)
        return res.json()
      })
      .then((data: MissionsData) => {
        setMissionsData(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load mission data')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (scenarioAId) {
      loadTimeseries(scenarioAId)
      loadHorizon(scenarioAId)
    }
    if (scenarioBId) {
      loadTimeseries(scenarioBId)
      loadHorizon(scenarioBId)
    }
  }, [scenarioAId, scenarioBId, loadTimeseries, loadHorizon])

  // Flash the sticky-header pill for 1.5s when a scenario assignment happens,
  // and surface a "Jump to Comparison" chip on small screens.
  const triggerAssignFeedback = (type: 'A' | 'B') => {
    if (type === 'A') {
      setFlashA(true)
      setTimeout(() => setFlashA(false), 1500)
    } else {
      setFlashB(true)
      setTimeout(() => setFlashB(false), 1500)
    }
    setShowJumpChip(true)
    setTimeout(() => setShowJumpChip(false), 4000)
  }

  const assignToScenario = (site: SelectableSite, type: 'A' | 'B') => {
    if (type === 'A') setScenarioA(site.id)
    else setScenarioB(site.id)
    triggerAssignFeedback(type)
    setSelectedLocation(null)
  }

  const handleSelectSiteFromMapOrGlobe = (site: SelectableSite) => {
    setSelectedLocation({ kind: 'site', site })
  }

  const handlePickCoordsFromMapOrGlobe = (lat: number, lon: number) => {
    setPickedCoords(lat, lon)
    setSelectedLocation({ kind: 'coords', lat, lon })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-[#8A8A88] gap-3">
        <div className="w-8 h-8 border-2 border-[#6FA8C9] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading CLPS mission registry and lunar ephemerides...</span>
      </div>
    )
  }

  if (error || !missionsData) {
    return (
      <div className="p-6 bg-[#2A1210] border border-[#7F2318] rounded text-[#E5604A] max-w-lg mx-auto my-12 text-center">
        <h2 className="text-base font-semibold mb-1">Failed to Load Missions</h2>
        <p className="text-xs">{error || 'Data is unavailable'}</p>
      </div>
    )
  }

  // Combine missions, candidate sites, and reference sites into unified selectable list
  const selectableSites: SelectableSite[] = [
    ...missionsData.missions.map((m) => ({
      id: m.id,
      name: m.name,
      kind: 'mission' as const,
      lat: m.site.lat,
      lon: m.site.lon,
      isMission: true,
      status: m.status,
      provider: m.provider,
      lander: m.lander,
      region_type: m.site.region_type,
      coord_kind: m.site.coord_kind,
      coord_status: (m.site.lat !== null && m.site.lon !== null ? 'ok' : 'skipped_null') as any,
      uncertainty_km: m.site.uncertainty_km,
      verified: m.verified,
      sources: m.sources,
      notes: m.notes,
      payload_highlights: m.payload_highlights,
      dates: m.dates,
      elevation_m: m.site.elevation_m,
      terrain_tier: m.site.terrain_tier,
    })),
    ...(missionsData.candidate_sites || []).map((c) => ({
      id: c.id,
      name: c.name,
      kind: 'candidate' as const,
      lat: c.lat_center,
      lon: c.lon_center,
      isMission: false,
      region_type: c.target_region,
      coord_kind: (c.coordinate_kind === 'specific_site' ? 'specific_site' : 'region_centre') as CoordKind,
      coord_status: (c.lat_center !== null && c.lon_center !== null ? 'ok' : 'skipped_null') as any,
      uncertainty_km: c.uncertainty_km,
      verified: c.verified ?? false,
      sources: c.sources,
      notes: c.notes,
      elevation_m: null,
      terrain_tier: (c.terrain_tier as TerrainTier) ?? null,
    })),
    ...missionsData.reference_sites.map((r) => ({
      id: r.id,
      name: r.id === 'mons-mouton-summit' ? 'Mons Mouton (reference point)' : r.name,
      kind: 'reference' as const,
      lat: r.lat,
      lon: r.lon,
      isMission: false,
      coord_kind: 'actual' as const,
      coord_status: 'ok' as const,
      notes: r.id === 'mons-mouton-summit'
        ? 'Regional reference anchor point on the flank of Mons Mouton (-84.6°S, 31.0°E, 5045 m). The topographic crest rises to >10,400 m ~2 km away.'
        : r.note,
    })),
  ]

  const siteA = selectableSites.find((s) => s.id === scenarioAId)
  const siteB = selectableSites.find((s) => s.id === scenarioBId)

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* ================= STEP 1: Sticky Simulation Bar ================= */}
      {/* Global physics controls live here, right under the navbar, so it's immediately
          clear what parameters drive every panel below (Scenario pills, synced UTC date,
          Terrain/Flat toggle, Mast Height, and Window Duration). Secondary sliders are
          tucked into the Advanced Physics popover. */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-2.5 bg-[#070A0D]/95 backdrop-blur border-b border-[#2A2D31] flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Scenario A / B pills */}
            <span
              className={`px-2.5 py-1 rounded text-3xs font-bold font-mono uppercase tracking-wider bg-[#E0A04A] text-[#050608] transition-shadow ${
                flashA ? 'ring-2 ring-[#E4E4E2] ring-offset-2 ring-offset-[#070A0D]' : ''
              }`}
              title={siteA?.name}
            >
              A: {siteA?.name ? (siteA.name.length > 22 ? siteA.name.slice(0, 20) + '…' : siteA.name) : '—'}
            </span>
            <span
              className={`px-2.5 py-1 rounded text-3xs font-bold font-mono uppercase tracking-wider bg-[#6FA8C9] text-[#050608] transition-shadow ${
                flashB ? 'ring-2 ring-[#E4E4E2] ring-offset-2 ring-offset-[#070A0D]' : ''
              }`}
              title={siteB?.name}
            >
              B: {siteB?.name ? (siteB.name.length > 22 ? siteB.name.slice(0, 20) + '…' : siteB.name) : '—'}
            </span>

            <div className="h-5 w-px bg-[#2A2D31] hidden sm:block" />

            {/* Terrain vs Flat */}
            <div className="flex items-center bg-[#0D1014] p-0.5 rounded border border-[#2A2D31] text-3xs font-mono">
              <button
                onClick={() => setHorizonMode('terrain')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  horizonMode === 'terrain'
                    ? 'bg-[#6DBF8B]/20 text-[#6DBF8B] border border-[#6DBF8B]/50 font-bold'
                    : 'text-[#8A8A88] hover:text-[#E4E4E2]'
                }`}
              >
                Terrain
              </button>
              <button
                onClick={() => setHorizonMode('flat')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  horizonMode === 'flat'
                    ? 'bg-[#171B22] text-[#E4E4E2] font-bold border border-[#2A2D31]'
                    : 'text-[#8A8A88] hover:text-[#E4E4E2]'
                }`}
              >
                Flat
              </button>
            </div>

            {/* Mast Height */}
            <div className="flex items-center gap-1 text-3xs font-mono">
              <span className="text-[#8A8A88] hidden md:inline">Mast:</span>
              {MAST_HEIGHTS.map((h) => (
                <button
                  key={h}
                  onClick={() => setMastHeightM(h)}
                  className={`px-1.5 py-0.5 rounded border transition-colors ${
                    mastHeightM === h
                      ? 'bg-[#6FA8C9]/20 text-[#6FA8C9] border-[#6FA8C9]/50 font-bold'
                      : 'bg-[#0D1014] text-[#8A8A88] border-[#2A2D31] hover:text-[#E4E4E2]'
                  }`}
                >
                  {h}m
                </button>
              ))}
            </div>

            {/* Window Duration */}
            <div className="flex items-center gap-1 text-3xs font-mono">
              <span className="text-[#8A8A88] hidden md:inline">Window:</span>
              {WINDOW_DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setWindowDays(d)}
                  className={`px-1.5 py-0.5 rounded border transition-colors ${
                    windowDays === d
                      ? 'bg-[#E0A04A]/20 text-[#E0A04A] border-[#E0A04A]/50 font-bold'
                      : 'bg-[#0D1014] text-[#8A8A88] border-[#2A2D31] hover:text-[#E4E4E2]'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Physics popover toggle */}
          <button
            type="button"
            onClick={() => setShowAdvancedPhysics((v) => !v)}
            className="px-2.5 py-1 rounded text-3xs font-mono font-medium bg-[#0D1014] text-[#B9A58C] border border-[#2A2D31] hover:border-[#B9A58C]/50 transition-colors shrink-0"
          >
            Advanced Physics {showAdvancedPhysics ? '▲' : '▼'}
          </button>
        </div>

        {/* Advanced Physics popover: Sun Threshold, Antenna Margin, Earth Disk Criterion, Solar Array Type */}
        {showAdvancedPhysics && (
          <div className="p-3 bg-[#0D1014] border border-[#2A2D31] rounded grid grid-cols-1 md:grid-cols-4 gap-4 font-mono animate-fade-in">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-3xs">
                <span className="text-[#8A8A88] font-medium">Sun Elevation Threshold:</span>
                <span className="text-[#E0A04A] font-bold">{thresholdDeg.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={thresholdDeg}
                onChange={(e) => setThresholdDeg(parseFloat(e.target.value))}
                className="w-full accent-[#E0A04A] cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-3xs">
                <span className="text-[#8A8A88] font-medium">Antenna Clearance Margin:</span>
                <span className="text-[#6FA8C9] font-bold">+{dteMarginDeg.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={dteMarginDeg}
                onChange={(e) => setDteMarginDeg(parseFloat(e.target.value))}
                className="w-full accent-[#6FA8C9] cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-3xs">
                <span className="text-[#8A8A88] font-medium">Earth LOS Criterion:</span>
                <span className="text-[#6FA8C9] capitalize">{earthCriterion.replace('_', ' ')}</span>
              </div>
              <select
                value={earthCriterion}
                onChange={(e) => setEarthCriterion(e.target.value as EarthCriterion)}
                className="w-full px-2 py-1 bg-[#050608] border border-[#2A2D31] rounded text-3xs text-[#E4E4E2] focus:outline-none"
              >
                <option value="center">Center LOS (Earth center &gt;= horizon + margin)</option>
                <option value="full_disk">Full Disk Clear (Lower limb above horizon)</option>
                <option value="any_limb">Any Limb Visible (Grazing contact)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-3xs">
                <span className="text-[#8A8A88] font-medium">Solar Array:</span>
              </div>
              <select
                value={solarArrayType}
                onChange={(e) => setSolarArrayType(e.target.value as SolarOrientation)}
                className="w-full px-2 py-1 bg-[#050608] border border-[#2A2D31] rounded text-3xs text-[#E4E4E2] focus:outline-none"
              >
                <option value="vertical">Vertical Mast (Azimuth Tracking)</option>
                <option value="flat">Horizontal Surface (cos i = sin el)</option>
                <option value="tracking">Full 2-Axis Sun Tracking</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Top Banner / Headline */}
      <div className="relative bg-[#0D1014] border border-[#2A2D31] p-5 rounded flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PanelCornerBrackets />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-3xs font-semibold uppercase bg-[#6FA8C9]/20 text-[#6FA8C9] border border-[#6FA8C9]/40 font-mono">
              CLPS Mission Browser
            </span>
            <span className="px-2 py-0.5 rounded text-3xs font-semibold uppercase bg-[#E0A04A]/20 text-[#E0A04A] border border-[#E0A04A]/40 font-mono">
              South Pole Focus
            </span>
            <span className="text-3xs text-[#8A8A88] font-mono hidden sm:inline">
              SPICE Ephemerides · Horizons Validated
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#E4E4E2]">
            Compare Lunar Landing Sites &amp; Visibility Windows
          </h1>
          <p className="text-xs text-[#8A8A88] mt-1 max-w-2xl">
            An intuitive trade-off evaluation tool for mission planners, educators, and the public to compare candidate landing sites, assess solar power generation potential, and direct-to-Earth (DTE) communication windows without complex GIS interfaces.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto bg-[#050608] px-4 py-2.5 rounded border border-[#2A2D31] text-xs">
          <div>
            <div className="text-3xs text-[#8A8A88] font-medium font-mono">CONVENTIONS</div>
            <div className="text-2xs font-mono text-[#E4E4E2]">MOON_ME Frame · UTC Time</div>
          </div>
          <div className="h-6 w-px bg-[#2A2D31]" />
          <div>
            <div className="text-3xs text-[#8A8A88] font-medium font-mono">HORIZON MODE</div>
            <div className="text-2xs font-mono text-[#6DBF8B] font-semibold">
              {horizonMode === 'terrain' ? `Terrain-Aware (${mastHeightM}m mast)` : 'Flat sphere, 0 deg horizon'}
            </div>
          </div>
        </div>
      </div>

      {/* Educational Guide Card for Mission Planners, Educators & Public */}
      <div className="bg-[#0D1014] border border-[#2A2D31] rounded p-4">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowEducationalCard(!showEducationalCard)}>
          <div className="flex items-center gap-2.5">
            <span className="text-base">🎓</span>
            <div>
              <h2 className="text-xs font-semibold text-[#E4E4E2] uppercase tracking-wider flex items-center gap-2">
                Why the Moon's South Pole? — Extreme Lighting &amp; Communication Constraints
              </h2>
              <p className="text-3xs text-[#8A8A88]">
                Educational context on polar solar elevation, lunar libration, and direct-to-Earth (DTE) communication physics.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-xs text-[#6FA8C9] hover:text-[#B8D9EC] font-mono px-2 py-0.5 rounded bg-[#050608] border border-[#2A2D31]"
          >
            {showEducationalCard ? 'Hide Guide ▲' : 'Show Guide ▼'}
          </button>
        </div>

        {showEducationalCard && (
          <div className="mt-3 pt-3 border-t border-[#2A2D31] grid grid-cols-1 md:grid-cols-3 gap-3.5 text-2xs text-[#8A8A88]">
            <div className="bg-[#050608] p-3 rounded border border-[#2A2D31] flex flex-col gap-1">
              <span className="text-[#E0A04A] font-semibold text-xs flex items-center gap-1.5 font-sans">
                <span>☀️</span> Grazing Polar Sunlight (~1.54° Tilt)
              </span>
              <p className="text-[#8A8A88] leading-relaxed text-3xs font-sans">
                Because the Moon's rotational axis is tilted only 1.54° relative to the ecliptic, the Sun always skims low along the horizon at the south pole. Small elevation changes determine whether solar panels are in bright sunlight or long crater shadows.
              </p>
            </div>

            <div className="bg-[#050608] p-3 rounded border border-[#2A2D31] flex flex-col gap-1">
              <span className="text-[#6FA8C9] font-semibold text-xs flex items-center gap-1.5 font-sans">
                <span>🌍</span> Lunar Libration &amp; Earth Horizon Wobble
              </span>
              <p className="text-[#8A8A88] leading-relaxed text-3xs font-sans">
                The Moon wobbles slightly in its orbit (libration of ~±6.7° latitude over ~27.3 days). At high southern latitudes, Earth hovers right near the horizon, oscillating above and below local line-of-sight for direct communication.
              </p>
            </div>

            <div className="bg-[#050608] p-3 rounded border border-[#2A2D31] flex flex-col gap-1">
              <span className="text-[#6DBF8B] font-semibold text-xs flex items-center gap-1.5 font-sans">
                <span>⚡</span> The Joint Power &amp; Comm Window
              </span>
              <p className="text-[#8A8A88] leading-relaxed text-3xs font-sans">
                Without relay orbiters or nuclear power, landers can only operate when the Sun generates solar power <strong className="text-[#E4E4E2]">and</strong> Earth is visible for telemetry. Our <span className="text-[#6DBF8B] font-mono">Joint Opportunity</span> timeline shows this exact overlap.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ================= STEP 2: Site Directory + Map/Globe ================= */}
      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6">
        <PanelCornerBrackets />
        <div className="lg:col-span-6">
          <MissionExplorer sites={selectableSites} />
        </div>
        <div className="lg:col-span-6 flex flex-col gap-2">
          {/* Map view switcher: Globe (default) / Flat polar map */}
          <div className="flex items-center justify-between p-2 bg-[#0D1014] border border-[#2A2D31] rounded text-xs">
            <span className="text-3xs uppercase font-mono text-[#8A8A88] font-semibold">
              Map View:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMapViewMode('globe')}
                className={`px-2.5 py-1 rounded text-3xs font-mono font-medium transition-colors ${
                  mapViewMode === 'globe'
                    ? 'bg-[#E0A04A]/20 text-[#E0A04A] border border-[#E0A04A]/50'
                    : 'bg-[#050608] text-[#8A8A88] hover:text-[#E4E4E2] border border-[#2A2D31]'
                }`}
              >
                🌐 3D Interactive Globe
              </button>
              <button
                type="button"
                onClick={() => setMapViewMode('flat')}
                className={`px-2.5 py-1 rounded text-3xs font-mono font-medium transition-colors ${
                  mapViewMode === 'flat'
                    ? 'bg-[#6FA8C9]/20 text-[#6FA8C9] border border-[#6FA8C9]/50'
                    : 'bg-[#050608] text-[#8A8A88] hover:text-[#E4E4E2] border border-[#2A2D31]'
                }`}
              >
                🗺️ Flat polar map
              </button>
            </div>
          </div>

          {mapViewMode === 'globe' ? (
            <div className="flex flex-col gap-1.5">
              <Suspense
                fallback={
                  <div className="w-full min-h-[460px] lg:min-h-[490px] bg-[#050608] border border-[#2A2D31] rounded flex items-center justify-center text-3xs font-mono text-[#8A8A88]">
                    Loading 3D lunar globe...
                  </div>
                }
              >
                <LunarGlobe
                  sites={selectableSites}
                  selectedSiteId={scenarioAId}
                  onSelectSite={handleSelectSiteFromMapOrGlobe}
                  onPickCoords={handlePickCoordsFromMapOrGlobe}
                  scenarioAId={scenarioAId}
                  scenarioBId={scenarioBId}
                  heightClass="min-h-[460px] lg:min-h-[490px]"
                  compact={false}
                />
              </Suspense>
              <div className="text-3xs font-mono text-[#8A8A88] px-1 text-right">
                Moon surface: NASA SVS CGI Moon Kit (LRO). Visual backdrop only; results use LOLA elevation data.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <MoonMap
                sites={selectableSites}
                onPickCoords={handlePickCoordsFromMapOrGlobe}
                onSelectSite={handleSelectSiteFromMapOrGlobe}
              />
              <div className="text-3xs font-mono text-[#8A8A88] px-1 text-right">
                Flat polar stereographic projection (R=1737.4 km).
              </div>
            </div>
          )}

          {/* Unified Selected Location Bar: appears for BOTH Globe pin/surface clicks
              and Map pin/surface clicks, so the two views behave identically. */}
          {selectedLocation && (
            <div className="p-3 bg-[#050608] border border-[#B9A58C]/40 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in text-xs">
              <div>
                {selectedLocation.kind === 'site' ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#E4E4E2]">{selectedLocation.site.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-3xs font-medium bg-[#171B22] text-[#8A8A88] font-mono">
                        {selectedLocation.site.kind === 'candidate' ? 'Candidate Site' : selectedLocation.site.isMission ? 'Mission' : 'Reference Site'}
                      </span>
                    </div>
                    <div className="text-[#8A8A88] font-mono text-2xs mt-0.5">
                      Lat: {selectedLocation.site.lat}° · Lon: {selectedLocation.site.lon}°
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-[#E4E4E2]">Custom Surface Point</span>
                    <div className="text-[#8A8A88] font-mono text-2xs mt-0.5">
                      Lat: {selectedLocation.lat}° · Lon: {selectedLocation.lon}°
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedLocation.kind === 'site' ? (
                  <>
                    <button
                      onClick={() => assignToScenario(selectedLocation.site, 'A')}
                      className="px-2.5 py-1 rounded bg-[#E0A04A]/15 hover:bg-[#E0A04A]/30 text-[#E0A04A] border border-[#E0A04A]/40 font-medium font-mono transition-colors"
                    >
                      Assign to Scenario A
                    </button>
                    <button
                      onClick={() => assignToScenario(selectedLocation.site, 'B')}
                      className="px-2.5 py-1 rounded bg-[#6FA8C9]/15 hover:bg-[#6FA8C9]/30 text-[#6FA8C9] border border-[#6FA8C9]/40 font-medium font-mono transition-colors"
                    >
                      Assign to Scenario B
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setPickedCoords(selectedLocation.lat, selectedLocation.lon)
                      setSelectedLocation(null)
                    }}
                    className="px-2.5 py-1 rounded bg-[#6DBF8B]/15 hover:bg-[#6DBF8B]/30 text-[#6DBF8B] border border-[#6DBF8B]/40 font-medium font-mono transition-colors"
                  >
                    Analyze Custom Point
                  </button>
                )}
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="px-2 py-1 rounded bg-[#171B22] hover:bg-[#2A2D31] text-[#8A8A88] font-mono"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= STEP 3: Scenario A & B Panels ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScenarioPanel type="A" sites={selectableSites} />
        <ScenarioPanel type="B" sites={selectableSites} />
      </div>

      {/* Stacked A/B Opportunity Timelines */}
      <OpportunityTimeline sites={selectableSites} />

      {/* Comparison Synthesis */}
      <div ref={comparisonRef} className="relative">
        <PanelCornerBrackets />
        <ComparisonPanel sites={selectableSites} />
      </div>

      {/* Floating "Jump to Comparison" chip on small screens after an assignment */}
      {showJumpChip && (
        <button
          onClick={() => comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fixed bottom-5 right-5 z-40 sm:hidden px-4 py-2 rounded-full bg-[#B9A58C] text-[#050608] text-xs font-bold font-mono shadow-lg animate-fade-in"
        >
          Jump to Comparison ↓
        </button>
      )}
    </div>
  )
}
