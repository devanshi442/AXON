import { useEffect, useState } from 'react'
import type { MissionsData, SelectableSite } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'
import MoonMap from '../components/MoonMap'
import MissionExplorer from '../components/MissionExplorer'
import ScenarioPanel from '../components/ScenarioPanel'
import OpportunityTimeline from '../components/OpportunityTimeline'
import ComparisonPanel from '../components/ComparisonPanel'

export default function ExplorerPage() {
  const [missionsData, setMissionsData] = useState<MissionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEducationalCard, setShowEducationalCard] = useState(true)

  const {
    scenarioAId,
    scenarioBId,
    loadTimeseries,
    loadHorizon,
    horizonMode,
    mastHeightM,
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
      <div className="flex flex-col items-center justify-center py-32 text-space-400 gap-3">
        <div className="w-8 h-8 border-2 border-earth-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading CLPS mission registry and lunar ephemerides...</span>
      </div>
    )
  }

  if (error || !missionsData) {
    return (
      <div className="p-6 bg-rose-950/40 border border-rose-800 rounded-2xl text-rose-300 max-w-lg mx-auto my-12 text-center">
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
    })),
    ...(missionsData.candidate_sites || []).map((c) => ({
      id: c.id,
      name: c.name,
      kind: 'candidate' as const,
      lat: c.lat_center,
      lon: c.lon_center,
      isMission: false,
      region_type: c.target_region,
      coord_kind: 'planned_region_center' as const,
      coord_status: (c.lat_center !== null && c.lon_center !== null ? 'ok' : 'skipped_null') as any,
      uncertainty_km: c.uncertainty_km,
      verified: c.verified ?? false,
      sources: c.sources,
      notes: c.notes,
    })),
    ...missionsData.reference_sites.map((r) => ({
      id: r.id,
      name: r.name,
      kind: 'reference' as const,
      lat: r.lat,
      lon: r.lon,
      isMission: false,
      coord_kind: 'actual' as const,
      coord_status: 'ok' as const,
      notes: r.note,
    })),
  ]

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Top Banner / Headline */}
      <div className="bg-gradient-to-r from-space-800 via-space-800/90 to-space-900 border border-space-700 p-5 rounded-2xl shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-3xs font-semibold uppercase bg-earth-500/20 text-earth-300 border border-earth-500/40">
              CLPS Mission Browser
            </span>
            <span className="px-2 py-0.5 rounded text-3xs font-semibold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
              South Pole Focus
            </span>
            <span className="text-3xs text-space-400 font-mono hidden sm:inline">
              SPICE Ephemerides · Horizons Validated
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-space-100">
            Compare Lunar Landing Sites &amp; Visibility Windows
          </h1>
          <p className="text-xs text-space-300 mt-1 max-w-2xl">
            An intuitive trade-off evaluation tool for mission planners, educators, and the public to compare candidate landing sites, assess solar power generation potential, and direct-to-Earth (DTE) communication windows without complex GIS interfaces.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto bg-space-900/80 px-4 py-2.5 rounded-xl border border-space-700/80 text-xs">
          <div>
            <div className="text-3xs text-space-400 font-medium">CONVENTIONS</div>
            <div className="text-2xs font-mono text-space-200">MOON_ME Frame · UTC Time</div>
          </div>
          <div className="h-6 w-px bg-space-700" />
          <div>
            <div className="text-3xs text-space-400 font-medium">HORIZON MODE</div>
            <div className="text-2xs font-mono text-emerald-400 font-semibold">
              {horizonMode === 'terrain' ? `Terrain-Aware (${mastHeightM}m mast)` : 'Idealized Datum (0°)'}
            </div>
          </div>
        </div>
      </div>

      {/* Educational Guide Card for Mission Planners, Educators & Public */}
      <div className="bg-space-800/90 border border-earth-500/30 rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowEducationalCard(!showEducationalCard)}>
          <div className="flex items-center gap-2.5">
            <span className="text-base">🎓</span>
            <div>
              <h2 className="text-xs font-semibold text-space-100 uppercase tracking-wider flex items-center gap-2">
                Why the Moon's South Pole? — Extreme Lighting &amp; Communication Constraints
              </h2>
              <p className="text-3xs text-space-400">
                Educational context on polar solar elevation, lunar libration, and direct-to-Earth (DTE) communication physics.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-xs text-earth-400 hover:text-earth-300 font-mono px-2 py-0.5 rounded bg-space-900 border border-space-700"
          >
            {showEducationalCard ? 'Hide Guide ▲' : 'Show Guide ▼'}
          </button>
        </div>

        {showEducationalCard && (
          <div className="mt-3 pt-3 border-t border-space-700/70 grid grid-cols-1 md:grid-cols-3 gap-3.5 text-2xs text-space-300">
            <div className="bg-space-900/70 p-3 rounded-xl border border-space-700/60 flex flex-col gap-1">
              <span className="text-sun-400 font-semibold text-xs flex items-center gap-1.5">
                <span>☀️</span> Grazing Polar Sunlight (~1.54° Tilt)
              </span>
              <p className="text-space-400 leading-relaxed text-3xs">
                Because the Moon's rotational axis is tilted only 1.54° relative to the ecliptic, the Sun always skims low along the horizon at the south pole. Small elevation changes determine whether solar panels are in bright sunlight or long crater shadows.
              </p>
            </div>

            <div className="bg-space-900/70 p-3 rounded-xl border border-space-700/60 flex flex-col gap-1">
              <span className="text-earth-400 font-semibold text-xs flex items-center gap-1.5">
                <span>🌍</span> Lunar Libration &amp; Earth Horizon Wobble
              </span>
              <p className="text-space-400 leading-relaxed text-3xs">
                The Moon wobbles slightly in its orbit (libration of ~±6.7° latitude over ~27.3 days). At high southern latitudes, Earth hovers right near the horizon, oscillating above and below local line-of-sight for direct communication.
              </p>
            </div>

            <div className="bg-space-900/70 p-3 rounded-xl border border-space-700/60 flex flex-col gap-1">
              <span className="text-emerald-400 font-semibold text-xs flex items-center gap-1.5">
                <span>⚡</span> The Joint Power &amp; Comm Window
              </span>
              <p className="text-space-400 leading-relaxed text-3xs">
                Without relay orbiters or nuclear power, landers can only operate when the Sun generates solar power <strong className="text-space-200">and</strong> Earth is visible for telemetry. Our <span className="text-emerald-300 font-mono">Joint Opportunity</span> timeline shows this exact overlap.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Grid: Mission Explorer & Moon Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <MissionExplorer sites={selectableSites} />
        </div>
        <div className="lg:col-span-6">
          <MoonMap sites={selectableSites} />
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
