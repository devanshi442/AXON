import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import type { MissionsData, SelectableSite, CoordKind, TerrainTier } from '../types/mission'
import { DEFAULT_LUNAR_VIEW, type LunarViewState } from '../types/lunarView'
import { useScenarioStore } from '../stores/scenarioStore'
import type { SolarOrientation, EarthCriterion } from '../utils/scienceMath'
import MoonMap from '../components/MoonMap'
import ScenarioPanel from '../components/ScenarioPanel'
import OpportunityTimeline from '../components/OpportunityTimeline'
import ComparisonPanel from '../components/ComparisonPanel'
import PanelCornerBrackets from '../components/PanelCornerBrackets'
import ExplorerHero from '../components/ExplorerHero'

const LunarGlobe = lazy(() => import('../components/LunarGlobe'))

const MAST_HEIGHTS = [0.0, 1.5, 2.5, 5.0, 10.0]
const WINDOW_DAY_OPTIONS = [0.5, 1, 7, 14, 30]

type CustomPointRequest = {
  requestId: number
  target: 'A' | 'B'
  lat: number
  lon: number
}

export default function ExplorerPage() {
  const [missionsData, setMissionsData] = useState<MissionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEducationalCard, setShowEducationalCard] = useState(false)
  const [mapViewMode, setMapViewMode] = useState<'both' | 'globe' | 'flat'>('both')
  const [showAdvancedPhysics, setShowAdvancedPhysics] = useState(false)
  const [flashA, setFlashA] = useState(false)
  const [flashB, setFlashB] = useState(false)
  const [customPointRequest, setCustomPointRequest] = useState<CustomPointRequest | null>(null)
  const customPointRequestIdRef = useRef(0)
  const [lunarViewState, setLunarViewState] = useState<LunarViewState>({ ...DEFAULT_LUNAR_VIEW })

  // Unified Selected Location Bar state
  const [selectedLocation, setSelectedLocation] = useState<
    | { kind: 'site'; site: SelectableSite }
    | { kind: 'coords'; lat: number; lon: number }
    | null
  >(null)

  const timelineRef = useRef<HTMLDivElement>(null)
  const comparisonRef = useRef<HTMLDivElement>(null)

  const {
    scenarioAId,
    scenarioBId,
    utcA,
    utcB,
    syncBToA,
    setUtcA,
    setUtcB,
    setSyncBToA,
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
    timeseriesCache,
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
    if (scenarioAId && !scenarioAId.startsWith('custom-')) {
      loadTimeseries(scenarioAId)
      loadHorizon(scenarioAId)
    }
    if (scenarioBId && !scenarioBId.startsWith('custom-')) {
      loadTimeseries(scenarioBId)
      loadHorizon(scenarioBId)
    }
  }, [scenarioAId, scenarioBId, loadTimeseries, loadHorizon])

  const triggerAssignFeedback = (type: 'A' | 'B') => {
    if (type === 'A') {
      setFlashA(true)
      setTimeout(() => setFlashA(false), 1500)
    } else {
      setFlashB(true)
      setTimeout(() => setFlashB(false), 1500)
    }
  }

  const runComparisonAndScroll = () => {
    if (scenarioAId && !scenarioAId.startsWith('custom-')) {
      loadTimeseries(scenarioAId)
      loadHorizon(scenarioAId)
    }
    if (scenarioBId && !scenarioBId.startsWith('custom-')) {
      loadTimeseries(scenarioBId)
      loadHorizon(scenarioBId)
    }
    timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const assignToScenario = (site: SelectableSite, type: 'A' | 'B') => {
    if (type === 'A') setScenarioA(site.id)
    else setScenarioB(site.id)
    if (site.lat !== null && site.lon !== null) {
      setLunarViewState((current) => ({
        ...current,
        centerLat: site.lat!,
        centerLon: site.lon!,
        origin: 'external',
      }))
    }
    triggerAssignFeedback(type)
    setSelectedLocation(null)
  }

  const handleSelectSiteFromMapOrGlobe = (site: SelectableSite) => {
    setSelectedLocation({ kind: 'site', site })
    if (site.lat !== null && site.lon !== null) {
      setLunarViewState((current) => ({
        ...current,
        centerLat: site.lat!,
        centerLon: site.lon!,
        origin: 'external',
      }))
    }
  }

  const handlePickCoordsFromMapOrGlobe = (lat: number, lon: number) => {
    setSelectedLocation({ kind: 'coords', lat, lon })
    setLunarViewState((current) => ({
      ...current,
      centerLat: lat,
      centerLon: lon,
      origin: 'external',
    }))
  }

  const handleLunarViewChange = (nextView: LunarViewState) => {
    setLunarViewState(nextView)
  }

  const requestCustomPointAnalysis = (target: 'A' | 'B') => {
    if (selectedLocation?.kind !== 'coords') return
    const requestId = ++customPointRequestIdRef.current
    setCustomPointRequest({
      requestId,
      target,
      lat: selectedLocation.lat,
      lon: selectedLocation.lon,
    })
    setSelectedLocation(null)
  }

  const handleCustomPointRequestHandled = (requestId: number) => {
    setCustomPointRequest((current) =>
      current?.requestId === requestId ? null : current
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-[#AFB3BA] gap-3">
        <div className="w-8 h-8 border-2 border-[#638BFF] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading CLPS mission registry and lunar ephemerides...</span>
      </div>
    )
  }

  if (error || !missionsData) {
    return (
      <div className="p-6 bg-[#2A1210] border border-[#7F2318] rounded text-[#EF6464] max-w-lg mx-auto my-12 text-center">
        <h2 className="text-base font-semibold mb-1">Failed to Load Missions</h2>
        <p className="text-xs">{error || 'Data is unavailable'}</p>
      </div>
    )
  }

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
  const cachedScenarioA = timeseriesCache[scenarioAId]
  const cachedScenarioB = timeseriesCache[scenarioBId]
  const scenarioPointA =
    siteA && siteA.lat !== null && siteA.lon !== null
      ? { lat: siteA.lat, lon: siteA.lon }
      : cachedScenarioA?.lat != null && cachedScenarioA.lon != null
        ? { lat: cachedScenarioA.lat, lon: cachedScenarioA.lon }
        : null
  const scenarioPointB =
    siteB && siteB.lat !== null && siteB.lon !== null
      ? { lat: siteB.lat, lon: siteB.lon }
      : cachedScenarioB?.lat != null && cachedScenarioB.lon != null
        ? { lat: cachedScenarioB.lat, lon: cachedScenarioB.lon }
        : null
  const scenarioPoints = { a: scenarioPointA, b: scenarioPointB }

  return (
    <div className="flex flex-col gap-5 animate-fade-in pb-12">
      <ExplorerHero />
      {/* ================= Sticky Simulation & Preset Bar ================= */}
      <div className="sticky top-[58px] z-30 -mx-4 px-4 py-2.5 bg-[#151619]/95 backdrop-blur border-b border-[#363A3F] flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded text-3xs font-bold font-mono uppercase tracking-wider bg-[#E9AD51] text-[#111113] transition-shadow ${
                flashA ? 'ring-2 ring-[#EDEEF0] ring-offset-2 ring-offset-[#151619]' : ''
              }`}
              title={siteA?.name}
            >
              A: {siteA?.name ? (siteA.name.length > 20 ? siteA.name.slice(0, 18) + '…' : siteA.name) : scenarioAId}
            </span>
            <span
              className={`px-2.5 py-1 rounded text-3xs font-bold font-mono uppercase tracking-wider bg-[#638BFF] text-[#111113] transition-shadow ${
                flashB ? 'ring-2 ring-[#EDEEF0] ring-offset-2 ring-offset-[#151619]' : ''
              }`}
              title={siteB?.name}
            >
              B: {siteB?.name ? (siteB.name.length > 20 ? siteB.name.slice(0, 18) + '…' : siteB.name) : scenarioBId}
            </span>

            {/* Date / Forecast UTC Selector */}
            <div className="flex flex-wrap items-center gap-2 rounded border border-[#363A3F] bg-[#18191B] px-2 py-1">
              <label className="flex items-center gap-1.5 text-3xs font-mono text-[#AFB3BA]">
                Forecast Date (UTC)
                <input
                  type="datetime-local"
                  value={utcA.slice(0, 16)}
                  onChange={(e) => e.target.value && setUtcA(new Date(e.target.value + ':00Z').toISOString())}
                  className="w-[154px] bg-[#111113] border border-[#363A3F] rounded px-1.5 py-0.5 text-[#EDEEF0]"
                />
              </label>
              <label className="flex items-center gap-1 text-3xs font-mono text-[#AFB3BA] select-none">
                <input
                  type="checkbox"
                  checked={syncBToA}
                  onChange={(e) => setSyncBToA(e.target.checked)}
                  className="accent-[#638BFF]"
                />
                Sync B
              </label>
              {!syncBToA && (
                <label className="flex items-center gap-1.5 text-3xs font-mono text-[#AFB3BA]">
                  UTC B
                  <input
                    type="datetime-local"
                    value={utcB.slice(0, 16)}
                    onChange={(e) => e.target.value && setUtcB(new Date(e.target.value + ':00Z').toISOString())}
                    className="w-[154px] bg-[#111113] border border-[#363A3F] rounded px-1.5 py-0.5 text-[#EDEEF0]"
                  />
                </label>
              )}
            </div>

            {/* Terrain vs Flat */}
            <div className="flex items-center bg-[#18191B] p-0.5 rounded border border-[#363A3F] text-3xs font-mono">
              <button
                onClick={() => setHorizonMode('terrain')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  horizonMode === 'terrain'
                    ? 'bg-[#30C48D]/20 text-[#30C48D] border border-[#30C48D]/50 font-bold'
                    : 'text-[#AFB3BA] hover:text-[#EDEEF0]'
                }`}
              >
                Terrain
              </button>
              <button
                onClick={() => setHorizonMode('flat')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  horizonMode === 'flat'
                    ? 'bg-[#272A2D] text-[#EDEEF0] font-bold border border-[#363A3F]'
                    : 'text-[#AFB3BA] hover:text-[#EDEEF0]'
                }`}
              >
                Flat
              </button>
            </div>

            {/* Mast Height */}
            <div className="flex items-center gap-1 text-3xs font-mono">
              <span className="text-[#AFB3BA] hidden md:inline">Mast:</span>
              {MAST_HEIGHTS.map((h) => (
                <button
                  key={h}
                  onClick={() => setMastHeightM(h)}
                  className={`px-1.5 py-0.5 rounded border transition-colors ${
                    mastHeightM === h
                      ? 'bg-[#638BFF]/20 text-[#638BFF] border-[#638BFF]/50 font-bold'
                      : 'bg-[#18191B] text-[#AFB3BA] border-[#363A3F] hover:text-[#EDEEF0]'
                  }`}
                >
                  {h}m
                </button>
              ))}
            </div>

            {/* Window Duration (12h, 24h, 7d, 14d, 30d) */}
            <div className="flex items-center gap-1 text-3xs font-mono">
              <span className="text-[#AFB3BA] hidden md:inline">Window:</span>
              {WINDOW_DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setWindowDays(d)}
                  className={`px-1.5 py-0.5 rounded border transition-colors ${
                    windowDays === d
                      ? 'bg-[#E9AD51]/20 text-[#E9AD51] border-[#E9AD51]/50 font-bold'
                      : 'bg-[#18191B] text-[#AFB3BA] border-[#363A3F] hover:text-[#EDEEF0]'
                  }`}
                >
                  {d === 0.5 ? '12h' : d === 1 ? '24h' : `${d}d`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Primary Action Button in Sticky Bar */}
            <button
              type="button"
              onClick={runComparisonAndScroll}
              className="px-3 py-1 rounded text-3xs font-mono font-bold uppercase tracking-wider bg-[#30C48D] hover:bg-[#5aa877] text-[#111113] transition-colors cursor-pointer shadow"
            >
              Compare &amp; View Forecast ↓
            </button>

            <button
              type="button"
              onClick={() => setShowAdvancedPhysics((v) => !v)}
              className="px-2.5 py-1 rounded text-3xs font-mono font-medium bg-[#18191B] text-[#638BFF] border border-[#363A3F] hover:border-[#638BFF]/50 transition-colors shrink-0"
            >
              Physics {showAdvancedPhysics ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {showAdvancedPhysics && (
          <div className="p-3 bg-[#18191B] border border-[#363A3F] rounded grid grid-cols-1 md:grid-cols-4 gap-4 font-mono animate-fade-in">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-3xs">
                <span className="text-[#AFB3BA] font-medium">Sun Elevation Threshold:</span>
                <span className="text-[#E9AD51] font-bold">{thresholdDeg.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={thresholdDeg}
                onChange={(e) => setThresholdDeg(parseFloat(e.target.value))}
                className="w-full accent-[#E9AD51] cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-3xs">
                <span className="text-[#AFB3BA] font-medium">Antenna Clearance Margin:</span>
                <span className="text-[#638BFF] font-bold">+{dteMarginDeg.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={dteMarginDeg}
                onChange={(e) => setDteMarginDeg(parseFloat(e.target.value))}
                className="w-full accent-[#638BFF] cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-3xs">
                <span className="text-[#AFB3BA] font-medium">Earth LOS Criterion:</span>
                <span className="text-[#638BFF] capitalize">{earthCriterion.replace('_', ' ')}</span>
              </div>
              <select
                value={earthCriterion}
                onChange={(e) => setEarthCriterion(e.target.value as EarthCriterion)}
                className="w-full px-2 py-1 bg-[#111113] border border-[#363A3F] rounded text-3xs text-[#EDEEF0] focus:outline-none"
              >
                <option value="center">Center LOS (Earth center &gt;= horizon + margin)</option>
                <option value="full_disk">Full Disk Clear (Lower limb above horizon)</option>
                <option value="any_limb">Any Limb Visible (Grazing contact)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-3xs">
                <span className="text-[#AFB3BA] font-medium">Solar Array:</span>
              </div>
              <select
                value={solarArrayType}
                onChange={(e) => setSolarArrayType(e.target.value as SolarOrientation)}
                className="w-full px-2 py-1 bg-[#111113] border border-[#363A3F] rounded text-3xs text-[#EDEEF0] focus:outline-none"
              >
                <option value="vertical">Vertical Mast (Azimuth Tracking)</option>
                <option value="flat">Horizontal Surface (cos i = sin el)</option>
                <option value="tracking">Full 2-Axis Sun Tracking</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ================= Map & Globe Section (Side-by-Side or Full) ================= */}
      <div className="relative">
        <PanelCornerBrackets />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#18191B] border border-[#363A3F] rounded text-xs">
            <div className="flex items-center gap-2">
              <span className="text-3xs uppercase font-mono text-[#EDEEF0] font-semibold">
                South Polar Targeting Canvas
              </span>
              <span className="px-2 py-0.5 rounded bg-[#111113] border border-[#363A3F] text-3xs font-mono text-[#638BFF]">
                Preset Domain: Lat -90° to -70°S · Lon -180° to +180°E
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMapViewMode('both')}
                className={`px-2.5 py-1 rounded text-3xs font-mono font-medium transition-colors ${
                  mapViewMode === 'both'
                    ? 'bg-[#30C48D]/20 text-[#30C48D] border border-[#30C48D]/50 font-bold'
                    : 'bg-[#111113] text-[#AFB3BA] hover:text-[#EDEEF0] border border-[#363A3F]'
                }`}
              >
                Split View (3D Globe + Flat Polar Map)
              </button>
              <button
                type="button"
                onClick={() => setMapViewMode('globe')}
                className={`px-2.5 py-1 rounded text-3xs font-mono font-medium transition-colors ${
                  mapViewMode === 'globe'
                    ? 'bg-[#E9AD51]/20 text-[#E9AD51] border border-[#E9AD51]/50 font-bold'
                    : 'bg-[#111113] text-[#AFB3BA] hover:text-[#EDEEF0] border border-[#363A3F]'
                }`}
              >
                3D Globe Only
              </button>
              <button
                type="button"
                onClick={() => setMapViewMode('flat')}
                className={`px-2.5 py-1 rounded text-3xs font-mono font-medium transition-colors ${
                  mapViewMode === 'flat'
                    ? 'bg-[#638BFF]/20 text-[#638BFF] border border-[#638BFF]/50 font-bold'
                    : 'bg-[#111113] text-[#AFB3BA] hover:text-[#EDEEF0] border border-[#363A3F]'
                }`}
              >
                Flat Polar Map Only
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${mapViewMode === 'both' ? 'lg:grid-cols-12' : ''} gap-4 items-stretch`}>
            {(mapViewMode === 'both' || mapViewMode === 'globe') && (
              <div className={`${mapViewMode === 'both' ? 'lg:col-span-6' : ''} flex flex-col h-[540px]`}>
                <Suspense
                  fallback={
                    <div className="w-full h-[540px] bg-[#111113] border border-[#363A3F] rounded flex items-center justify-center text-3xs font-mono text-[#AFB3BA]">
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
                    scenarioPoints={scenarioPoints}
                    heightClass="h-[420px]"
                    viewState={lunarViewState}
                    onViewChange={handleLunarViewChange}
                    restrictToSouthPole
                    compact={false}
                  />
                </Suspense>
              </div>
            )}

            {(mapViewMode === 'both' || mapViewMode === 'flat') && (
              <div className={`${mapViewMode === 'both' ? 'lg:col-span-6' : ''} flex flex-col h-[540px]`}>
                <MoonMap
                  viewState={lunarViewState}
                  scenarioPoints={scenarioPoints}
                  selectedPoint={
                    selectedLocation?.kind === 'coords'
                      ? { lat: selectedLocation.lat, lon: selectedLocation.lon }
                      : selectedLocation?.kind === 'site' &&
                          selectedLocation.site.lat !== null &&
                          selectedLocation.site.lon !== null
                        ? { lat: selectedLocation.site.lat, lon: selectedLocation.site.lon }
                        : null
                  }
                  onViewChange={handleLunarViewChange}
                  onPickCoords={handlePickCoordsFromMapOrGlobe}
                />
              </div>
            )}
          </div>

          {/* Selection Action Bar when clicking a pin or arbitrary surface point */}
          {selectedLocation && (
            <div className="p-3 bg-[#111113] border-2 border-[#638BFF] rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in text-xs shadow-lg">
              <div>
                {selectedLocation.kind === 'site' ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#EDEEF0]">{selectedLocation.site.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-3xs font-medium bg-[#272A2D] text-[#30C48D] font-mono">
                        {selectedLocation.site.kind === 'candidate' ? 'Artemis Candidate' : selectedLocation.site.isMission ? 'CLPS Mission' : 'Reference Site'}
                      </span>
                    </div>
                    <div className="text-[#AFB3BA] font-mono text-2xs mt-0.5">
                      Lat: {selectedLocation.site.lat}° · Lon: {selectedLocation.site.lon}°
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-[#30C48D]">Arbitrary Surface Point Selected</span>
                    <div className="text-[#EDEEF0] font-mono text-2xs mt-0.5">
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
                      className="px-3 py-1.5 rounded bg-[#E9AD51] text-[#111113] font-bold font-mono transition-colors cursor-pointer"
                    >
                      Set as Scenario A
                    </button>
                    <button
                      onClick={() => assignToScenario(selectedLocation.site, 'B')}
                      className="px-3 py-1.5 rounded bg-[#638BFF] text-[#111113] font-bold font-mono transition-colors cursor-pointer"
                    >
                      Set as Scenario B
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => requestCustomPointAnalysis('A')}
                      className="px-3 py-1.5 rounded bg-[#E9AD51] text-[#111113] font-bold font-mono transition-colors cursor-pointer"
                    >
                      Analyze in Scenario A
                    </button>
                    <button
                      onClick={() => requestCustomPointAnalysis('B')}
                      className="px-3 py-1.5 rounded bg-[#638BFF] text-[#111113] font-bold font-mono transition-colors cursor-pointer"
                    >
                      Analyze in Scenario B
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="px-2 py-1 rounded bg-[#272A2D] hover:bg-[#363A3F] text-[#AFB3BA] font-mono"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= Scenario A & B Configuration + Action Bar ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ScenarioPanel
          type="A"
          sites={selectableSites}
          customPointRequest={customPointRequest}
          onCustomPointRequestHandled={handleCustomPointRequestHandled}
          onCustomAnalysisComplete={triggerAssignFeedback}
        />
        <ScenarioPanel
          type="B"
          sites={selectableSites}
          customPointRequest={customPointRequest}
          onCustomPointRequestHandled={handleCustomPointRequestHandled}
          onCustomAnalysisComplete={triggerAssignFeedback}
        />
      </div>

      {/* Explicit Action Bar between Scenario Selection and Comparison Results */}
      <div className="p-3 bg-[#18191B] border border-[#638BFF]/50 rounded flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-[#EDEEF0] font-mono">
          Ready to evaluate <strong className="text-[#E9AD51]">Scenario A ({siteA?.name || scenarioAId})</strong> vs{' '}
          <strong className="text-[#638BFF]">Scenario B ({siteB?.name || scenarioBId})</strong> over{' '}
          <strong className="text-[#30C48D]">{windowDays === 0.5 ? '12 hours' : windowDays === 1 ? '24 hours' : `${windowDays} days`}</strong>.
        </div>
        <button
          type="button"
          onClick={runComparisonAndScroll}
          className="px-5 py-2 rounded bg-[#30C48D] hover:bg-[#5aa877] text-[#111113] text-xs font-bold font-mono uppercase tracking-wider transition-colors cursor-pointer shrink-0 shadow-md"
        >
          Run Comparison &amp; 30-Day Forecast ↓
        </button>
      </div>

      {/* ================= Opportunity Timelines & Comparison Results ================= */}
      <div ref={timelineRef}>
        <OpportunityTimeline sites={selectableSites} />
      </div>

      <div ref={comparisonRef} className="relative">
        <PanelCornerBrackets />
        <ComparisonPanel sites={selectableSites} />
      </div>

      {/* Educational Guide tucked cleanly at the bottom as a collapsible reference */}
      <div className="bg-[#18191B] border border-[#363A3F] rounded p-3">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowEducationalCard(!showEducationalCard)}>
          <span className="text-xs font-semibold text-[#AFB3BA] uppercase tracking-wider font-mono">
            Reference Guide: Grazing Polar Sunlight (~1.54° Tilt) &amp; Lunar Libration
          </span>
          <span className="text-3xs text-[#638BFF] font-mono">
            {showEducationalCard ? 'Hide ▲' : 'Expand ▼'}
          </span>
        </div>
        {showEducationalCard && (
          <div className="mt-3 pt-3 border-t border-[#363A3F] grid grid-cols-1 md:grid-cols-3 gap-3 text-3xs text-[#AFB3BA]">
            <div className="bg-[#111113] p-2.5 rounded border border-[#363A3F]">
              <strong className="text-[#E9AD51] block mb-1">Grazing Polar Sunlight</strong>
              The Moon's axis is tilted only 1.54° to the ecliptic. At the South Pole, the Sun skims the horizon—topographic peaks stay lit while crater floors stay in shadow.
            </div>
            <div className="bg-[#111113] p-2.5 rounded border border-[#363A3F]">
              <strong className="text-[#638BFF] block mb-1">Lunar Libration &amp; DTE</strong>
              Orbital libration (~±6.7° latitude over 27.3 days) makes Earth bob above and below local terrain horizons.
            </div>
            <div className="bg-[#111113] p-2.5 rounded border border-[#363A3F]">
              <strong className="text-[#30C48D] block mb-1">Joint Operations Window</strong>
              Solar-powered landers without relay satellites require simultaneous sunlight and direct Earth line-of-sight.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
