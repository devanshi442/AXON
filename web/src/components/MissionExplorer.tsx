import { useState } from 'react'
import type { Mission } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'

interface MissionExplorerProps {
  missions: Mission[]
}

export default function MissionExplorer({ missions }: MissionExplorerProps) {
  const { scenarioAId, scenarioBId, setScenarioA, setScenarioB } = useScenarioStore()
  const [search, setSearch] = useState('')
  type FilterType = 'all' | 'south_pole' | 'landed' | 'planned' | 'failed'
  const [statusFilter, setStatusFilter] = useState<FilterType>('all')

  const filtered = missions.filter((m) => {
    const query = search.toLowerCase()
    const matchesSearch =
      m.name.toLowerCase().includes(query) ||
      m.provider.toLowerCase().includes(query) ||
      m.lander.toLowerCase().includes(query) ||
      m.site.name.toLowerCase().includes(query) ||
      (m.notes && m.notes.toLowerCase().includes(query))

    if (!matchesSearch) return false

    if (statusFilter === 'all') return true
    if (statusFilter === 'south_pole') {
      return (m.site.lat !== null && m.site.lat <= -70) || m.site.region_type.includes('polar')
    }
    if (statusFilter === 'landed') return m.status.startsWith('landed')
    if (statusFilter === 'planned') return m.status === 'planned'
    if (statusFilter === 'failed') return m.status === 'failed' || m.status === 'cancelled'
    return true
  })

  const filterOptions: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All Missions' },
    { id: 'south_pole', label: '🏔️ South Pole Focus' },
    { id: 'landed', label: 'Landed' },
    { id: 'planned', label: 'Planned' },
    { id: 'failed', label: 'Failed' },
  ]

  return (
    <div className="bg-space-800 border border-space-700 rounded-2xl p-4 flex flex-col gap-4 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-space-100 uppercase tracking-wider">
            CLPS Missions Directory
          </h2>
          <p className="text-2xs text-space-400 mt-0.5">
            NASA Commercial Lunar Payload Services records with cited sources.
          </p>
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <input
            type="text"
            placeholder="Search missions, providers..."
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
                  : 'bg-earth-500/20 text-earth-300 border border-earth-500/40'
                : 'bg-space-900 text-space-400 hover:text-space-200 border border-space-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Mission cards scroll list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[560px] overflow-y-auto pr-1">
        {filtered.map((m) => {
          const isA = m.id === scenarioAId
          const isB = m.id === scenarioBId
          const hasCoords = m.site.lat !== null && m.site.lon !== null

          return (
            <div
              key={m.id}
              className={`p-3.5 rounded-xl bg-space-900 border transition-all ${
                isA && isB
                  ? 'border-sun-500 ring-1 ring-earth-500'
                  : isA
                  ? 'border-sun-500 ring-1 ring-sun-500'
                  : isB
                  ? 'border-earth-500 ring-1 ring-earth-500'
                  : 'border-space-700/80 hover:border-space-600'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-space-100 flex items-center gap-1.5">
                    {m.name}
                    {m.clps_task_order && (
                      <span className="text-3xs font-mono px-1 py-0.2 bg-space-800 text-space-300 rounded border border-space-700">
                        {m.clps_task_order}
                      </span>
                    )}
                  </h3>
                  <div className="text-3xs text-space-400 mt-0.5">
                    {m.provider} · Lander: {m.lander}
                  </div>
                </div>

                {/* Status tag */}
                <span
                  className={`px-2 py-0.5 rounded text-3xs font-medium uppercase tracking-wider ${
                    m.status === 'landed_success'
                      ? 'bg-blue-950 text-blue-300 border border-blue-800'
                      : m.status === 'landed_partial'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : m.status === 'planned'
                      ? 'bg-space-800 text-space-300 border border-space-600'
                      : 'bg-violet-950 text-violet-300 border border-violet-800'
                  }`}
                >
                  {m.status.replace('_', ' ')}
                </span>
              </div>

              {/* Site & coordinates */}
              <div className="mt-2 text-2xs bg-space-800/80 p-2 rounded-lg border border-space-700/60 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-space-300 font-medium">{m.site.name}</span>
                  <span className="text-3xs text-space-400 capitalize">{m.site.region_type.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center justify-between text-3xs font-mono">
                  <span className="text-space-400">
                    {hasCoords ? `Lat: ${m.site.lat}° · Lon: ${m.site.lon}°` : 'Coordinates: Not published'}
                  </span>
                  {hasCoords && (
                    <span className="text-space-400">
                      [{m.site.coord_kind === 'actual' ? 'Actual' : 'Region Center'}]
                    </span>
                  )}
                </div>
              </div>

              {/* Dates & Payloads */}
              <div className="mt-2 text-3xs text-space-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                {m.dates.launch.date && <span>Launch: {m.dates.launch.date}</span>}
                {m.dates.landing.date && <span>Landing: {m.dates.landing.date}</span>}
                {m.payload_highlights.length > 0 && (
                  <span className="text-space-300">Payload: {m.payload_highlights[0]}</span>
                )}
              </div>

              {/* Integrity & Verification Badge */}
              <div className="mt-2.5 pt-2 border-t border-space-800 flex items-center justify-between">
                <div>
                  {m.verified ? (
                    <span className="text-3xs text-emerald-400 flex items-center gap-1 font-medium">
                      ✓ Verified by 2nd reviewer
                    </span>
                  ) : (
                    <span className="text-3xs text-amber-400/90 flex items-center gap-1">
                      ⚠️ Unverified (Pending 2nd review)
                    </span>
                  )}
                </div>

                {/* Scenario Assign Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={!hasCoords}
                    onClick={() => setScenarioA(m.id)}
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
                    onClick={() => setScenarioB(m.id)}
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

              {/* Sources link */}
              {m.sources.length > 0 && (
                <div className="mt-1.5 text-3xs text-space-400 truncate">
                  Source:{' '}
                  <a
                    href={m.sources[0].url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-earth-400 hover:underline"
                  >
                    {m.sources[0].title}
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
