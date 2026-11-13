import { useEffect, useState, lazy, Suspense } from 'react'
import type { MissionsData, SelectableSite, CoordKind, TerrainTier } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'
import MoonMap from '../components/MoonMap'
import MissionExplorer from '../components/MissionExplorer'
import ScenarioPanel from '../components/ScenarioPanel'
import OpportunityTimeline from '../components/OpportunityTimeline'
import ComparisonPanel from '../components/ComparisonPanel'
import PanelCornerBrackets from '../components/PanelCornerBrackets'

const LunarGlobe = lazy(() => import('../components/LunarGlobe'))

export default function ExplorerPage() {
  const [missionsData, setMissionsData] = useState<MissionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEducationalCard, setShowEducationalCard] = useState(false)
  const [mapViewMode, setMapViewMode] = useState<'globe' | 'flat'>('globe')

  const {
    scenarioAId,
    scenarioBId,
    setScenarioA,
    loadTimeseries,
    loadHorizon,
    horizonMode,
    mastHeightM,
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

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
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
      <div className="relative bg-[#0D1014] border border-[#2A2D31] rounded p-4">
        <PanelCornerBrackets />
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

      {/* Grid: Mission Explorer & Moon Map / Globe */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
                  onSelectSite={(site) => setScenarioA(site.id)}
                  onPickCoords={(lat, lon) => setPickedCoords(lat, lon)}
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
                onPickCoords={(lat, lon) => setPickedCoords(lat, lon)}
              />
              <div className="text-3xs font-mono text-[#8A8A88] px-1 text-right">
                Flat polar stereographic projection (R=1737.4 km).
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Scenario A & Scenario B Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScenarioPanel type="A" sites={selectableSites} />
        <ScenarioPanel type="B" sites={selectableSites} />
      </div>

      {/* 30-Day Opportunity Timelines */}
      <OpportunityTimeline sites={selectableSites} />

      {/* Side-by-Side Comparison */}
      <ComparisonPanel sites={selectableSites} />
    </div>
  )
}
