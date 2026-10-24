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

  const { scenarioAId, scenarioBId, loadTimeseries } = useScenarioStore()

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
    if (scenarioAId) loadTimeseries(scenarioAId)
    if (scenarioBId) loadTimeseries(scenarioBId)
  }, [scenarioAId, scenarioBId, loadTimeseries])

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

  // Combine missions and reference sites into unified selectable list
  const selectableSites: SelectableSite[] = [
    ...missionsData.missions.map((m) => ({
      id: m.id,
      name: m.name,
      lat: m.site.lat,
      lon: m.site.lon,
      isMission: true,
      status: m.status,
      provider: m.provider,
      lander: m.lander,
      region_type: m.site.region_type,
      coord_kind: m.site.coord_kind,
      verified: m.verified,
      sources: m.sources,
      notes: m.notes,
    })),
    ...missionsData.reference_sites.map((r) => ({
      id: r.id,
      name: r.name,
      lat: r.lat,
      lon: r.lon,
      isMission: false,
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
            <span className="text-3xs text-space-400 font-mono">
              SPICE Ephemerides · Horizons Validated
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-space-100">
            Compare Lunar Landing Sites &amp; Visibility Windows
          </h1>
          <p className="text-xs text-space-300 mt-1 max-w-2xl">
            Evaluate solar illumination and Direct-to-Earth (DTE) communication opportunities across candidate landing sites. Select two scenarios to compare live.
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
            <div className="text-2xs font-mono text-space-200">Idealized Datum (0°)</div>
          </div>
        </div>
      </div>

      {/* Grid: Mission Explorer & Moon Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <MissionExplorer missions={missionsData.missions} />
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
