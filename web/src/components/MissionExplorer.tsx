import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'
import { formatUtcDisplay } from '../utils/scienceMath'

interface MissionExplorerProps {
  sites: SelectableSite[]
}

export default function MissionExplorer({ sites }: MissionExplorerProps) {
  const { scenarioAId, scenarioBId, setScenarioA, setScenarioB, utcA } = useScenarioStore()
  const [search, setSearch] = useState('')
  type FilterType = 'all' | 'south_pole' | 'candidate' | 'mission' | 'landed' | 'planned'
  const [statusFilter, setStatusFilter] = useState<FilterType>('all')

  const filtered = sites.filter((s) => {
    const query = search.toLowerCase()
    const matchesSearch =
      s.name.toLowerCase().includes(query) ||
      (s.provider && s.provider.toLowerCase().includes(query)) ||
      (s.lander && s.lander.toLowerCase().includes(query)) ||
      (s.region_type && s.region_type.toLowerCase().includes(query)) ||
      (s.notes && s.notes.toLowerCase().includes(query))

    if (!matchesSearch) return false

    if (statusFilter === 'all') return true
    if (statusFilter === 'south_pole') {
      return (s.lat !== null && s.lat <= -70) || (s.region_type && s.region_type.includes('polar'))
    }
    if (statusFilter === 'candidate') return s.kind === 'candidate'
    if (statusFilter === 'mission') return s.kind === 'mission'
    if (statusFilter === 'landed') return s.status ? s.status.startsWith('landed') : false
    if (statusFilter === 'planned') return s.status === 'planned' || s.kind === 'candidate'
    return true
  })

  const filterOptions: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All Sites' },
    { id: 'south_pole', label: '🏔️ South Pole (< -70°)' },
    { id: 'candidate', label: '🎯 Artemis / Candidates' },
    { id: 'mission', label: '🚀 CLPS Missions' },
    { id: 'landed', label: 'Landed' },
    { id: 'planned', label: 'Planned' },
  ]

  return (
    <div className="bg-space-800 border border-space-700 rounded-2xl p-4 flex flex-col gap-4 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-space-100 uppercase tracking-wider flex items-center gap-1.5">
            <span>🚀</span> Lunar Landing Sites Directory
          </h2>
          <p className="text-2xs text-space-400 mt-0.5">
            CLPS missions &amp; Artemis candidate regions with cited primary sources.
          </p>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px]">
          <input
            type="text"
            placeholder="Search sites, missions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 pl-8 bg-space-900 border border-space-600 rounded-lg text-xs text-space-100 placeholder-space-400 focus:outline-none focus:border-earth-500 transition-colors"
          />
          <svg className="w-4 h-4 text-space-400 absolute left-2.5 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5 text-2xs">
        {filterOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setStatusFilter(opt.id)}
            className={`px-3 py-1 rounded-full font-medium transition-colors ${
              statusFilter === opt.id
                ? opt.id === 'south_pole'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : opt.id === 'candidate'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                  : 'bg-earth-500/20 text-earth-300 border border-earth-500/40'
                : 'bg-space-900 text-space-400 hover:text-space-200 border border-space-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Site cards scroll list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[560px] overflow-y-auto pr-1">
        {filtered.map((s) => {
          const isA = s.id === scenarioAId
          const isB = s.id === scenarioBId
          const hasCoords = s.lat !== null && s.lon !== null

          return (
            <div
              key={s.id}
              className={`p-3.5 rounded-xl bg-space-900 border transition-all flex flex-col justify-between ${
                isA && isB
                  ? 'border-sun-500 ring-1 ring-earth-500'
                  : isA
                  ? 'border-sun-500 ring-1 ring-sun-500'
                  : isB
                  ? 'border-earth-500 ring-1 ring-earth-500'
                  : 'border-space-700/80 hover:border-space-600'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-space-100 flex items-center gap-1.5">
                      {s.name}
                    </h3>
                    <div className="text-3xs text-space-400 mt-0.5">
                      {s.kind === 'candidate' ? (
                        <span className="text-purple-300 font-medium">Artemis Candidate Region</span>
                      ) : s.kind === 'reference' ? (
                        <span className="text-cyan-300 font-medium">Reference Surface Anchor</span>
                      ) : (
                        <span>{s.provider} · Lander: {s.lander}</span>
                      )}
                    </div>
                  </div>

                  {/* Status tag */}
                  <span
                    className={`px-2 py-0.5 rounded text-3xs font-medium uppercase tracking-wider ${
                      s.status === 'landed_success'
                        ? 'bg-blue-950 text-blue-300 border border-blue-800'
                        : s.status === 'landed_partial'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : s.status === 'planned' || s.kind === 'candidate'
                        ? 'bg-purple-950/60 text-purple-300 border border-purple-800/80'
                        : 'bg-space-800 text-space-300 border border-space-600'
                    }`}
                  >
                    {s.kind === 'candidate' ? 'Candidate' : (s.status?.replace('_', ' ') || 'Reference')}
                  </span>
                </div>

                {/* Site & coordinates */}
                <div className="mt-2 text-2xs bg-space-800/80 p-2 rounded-lg border border-space-700/60 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-space-300 font-medium">{s.region_type ? s.region_type.replace(/_/g, ' ') : 'Lunar Surface'}</span>
                    {s.kind === 'candidate' && <span className="text-3xs text-purple-300 font-mono">Artemis III</span>}
                  </div>
                  <div className="flex items-center justify-between text-3xs font-mono">
                    <span className="text-space-400">
                      {hasCoords ? `Lat: ${s.lat}° · Lon: ${s.lon}°` : 'Coordinates: Not published (skipped)'}
                    </span>
                    {hasCoords && (
                      <span className="text-space-400">
                        [{s.coord_kind === 'specific_site' || s.coord_kind === 'actual' ? 'Specific site' : 'Region centre'}]
                      </span>
                    )}
                  </div>
                  {(s.coord_kind === 'region_centre' || s.coord_kind === 'planned_region_center') && (
                    <div className="mt-1 text-3xs text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Region centre; results can differ strongly from the crest or evaluated site.
                    </div>
                  )}
                  <div className="text-3xs text-space-400 font-mono mt-0.5">
                    Daylight: 30-day window from {formatUtcDisplay(utcA)}, mast 1.5 m
                  </div>
                </div>

                {/* Notes if available */}
                {s.notes && (
                  <p className="mt-1.5 text-3xs text-space-400 line-clamp-2">
                    {s.notes}
                  </p>
                )}
              </div>

              {/* Integrity & Verification Badge */}
              <div className="mt-2.5 pt-2 border-t border-space-800 flex items-center justify-between">
                <div>
                  {s.verified ? (
                    <span className="text-3xs text-emerald-400 flex items-center gap-1 font-medium">
                      ✓ Verified
                    </span>
                  ) : (
                    <span className="text-3xs text-amber-400/90 flex items-center gap-1">
                      ⚠️ Unverified
                    </span>
                  )}
                </div>

                {/* Scenario Assign Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={!hasCoords}
                    onClick={() => setScenarioA(s.id)}
                    className={`px-2 py-0.5 rounded text-3xs font-medium transition-colors ${
                      isA
                        ? 'bg-sun-500 text-space-950 font-bold'
                        : hasCoords
                        ? 'bg-sun-500/10 text-sun-300 hover:bg-sun-500/20 border border-sun-500/30'
                        : 'opacity-40 cursor-not-allowed bg-space-800 text-space-500'
                    }`}
                    title={hasCoords ? 'Set as Scenario A' : 'Cannot compute geometry: coordinates not published'}
                  >
                    Set A
                  </button>
                  <button
                    disabled={!hasCoords}
                    onClick={() => setScenarioB(s.id)}
                    className={`px-2 py-0.5 rounded text-3xs font-medium transition-colors ${
                      isB
                        ? 'bg-earth-500 text-space-950 font-bold'
                        : hasCoords
                        ? 'bg-earth-500/10 text-earth-300 hover:bg-earth-500/20 border border-earth-500/30'
                        : 'opacity-40 cursor-not-allowed bg-space-800 text-space-500'
                    }`}
                    title={hasCoords ? 'Set as Scenario B' : 'Cannot compute geometry: coordinates not published'}
                  >
                    Set B
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
