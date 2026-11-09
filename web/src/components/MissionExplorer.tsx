import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'
import { formatUtcDisplay } from '../utils/scienceMath'
import PanelCornerBrackets from './PanelCornerBrackets'

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
    <div className="relative bg-[#0D1014] border border-[#2A2D31] rounded p-4 flex flex-col gap-4">
      <PanelCornerBrackets />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#E4E4E2] uppercase tracking-wider flex items-center gap-1.5">
            <span>🚀</span> Lunar Landing Sites Directory
          </h2>
          <p className="text-2xs text-[#8A8A88] mt-0.5">
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
            className="w-full px-3 py-1.5 pl-8 bg-[#050608] border border-[#2A2D31] rounded text-xs text-[#E4E4E2] placeholder-[#8A8A88] focus:outline-none focus:border-[#B9A58C] transition-colors font-mono"
          />
          <svg className="w-4 h-4 text-[#8A8A88] absolute left-2.5 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5 text-2xs font-mono">
        {filterOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setStatusFilter(opt.id)}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              statusFilter === opt.id
                ? opt.id === 'south_pole'
                  ? 'bg-[#E0A04A]/20 text-[#E0A04A] border border-[#E0A04A]/50'
                  : opt.id === 'candidate'
                  ? 'bg-[#B9A58C]/20 text-[#B9A58C] border border-[#B9A58C]/50'
                  : 'bg-[#6FA8C9]/20 text-[#6FA8C9] border border-[#6FA8C9]/40'
                : 'bg-[#050608] text-[#8A8A88] hover:text-[#E4E4E2] border border-[#2A2D31]'
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
              className={`p-3.5 rounded bg-[#050608] border transition-all flex flex-col justify-between ${
                isA && isB
                  ? 'border-[#E0A04A] outline outline-1 outline-[#6FA8C9]'
                  : isA
                  ? 'border-[#E0A04A]'
                  : isB
                  ? 'border-[#6FA8C9]'
                  : 'border-[#2A2D31] hover:border-[#6B6F75]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-[#E4E4E2] flex items-center gap-1.5">
                      {s.name}
                    </h3>
                    <div className="text-3xs text-[#8A8A88] mt-0.5 font-mono">
                      {s.kind === 'candidate' ? (
                        <span className="text-[#B9A58C] font-medium">Artemis Candidate Region</span>
                      ) : s.kind === 'reference' ? (
                        <span className="text-[#6FA8C9] font-medium">Reference Surface Anchor</span>
                      ) : (
                        <span>{s.provider} · Lander: {s.lander}</span>
                      )}
                    </div>
                  </div>

                  {/* Status tag */}
                  <span
                    className={`px-2 py-0.5 rounded text-3xs font-medium font-mono uppercase tracking-wider ${
                      s.status === 'landed_success'
                        ? 'bg-[#132A1C] text-[#6DBF8B] border border-[#2A5C3D]'
                        : s.status === 'landed_partial'
                        ? 'bg-[#2A1210] text-[#E0A04A] border border-[#7F2318]'
                        : s.status === 'planned' || s.kind === 'candidate'
                        ? 'bg-[#171B22] text-[#B9A58C] border border-[#2A2D31]'
                        : 'bg-[#171B22] text-[#8A8A88] border border-[#2A2D31]'
                    }`}
                  >
                    {s.kind === 'candidate' ? 'Candidate' : (s.status?.replace('_', ' ') || 'Reference')}
                  </span>
                </div>

                {/* Site & coordinates */}
                <div className="mt-2 text-2xs bg-[#0D1014] p-2 rounded border border-[#2A2D31] flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#8A8A88] font-medium">{s.region_type ? s.region_type.replace(/_/g, ' ') : 'Lunar Surface'}</span>
                    {s.kind === 'candidate' && <span className="text-3xs text-[#B9A58C] font-mono">Artemis III</span>}
                  </div>
                  <div className="flex items-center justify-between text-3xs font-mono">
                    <span className="text-[#8A8A88]">
                      {hasCoords ? `Lat: ${s.lat}° · Lon: ${s.lon}°` : 'Coordinates: Not published (skipped)'}
                    </span>
                    {hasCoords && (
                      <span className="text-[#8A8A88]">
                        [{s.coord_kind === 'specific_site' || s.coord_kind === 'actual' ? 'Specific site' : 'Region centre'}]
                      </span>
                    )}
                  </div>
                  {(s.coord_kind === 'region_centre' || s.coord_kind === 'planned_region_center') && (
                    <div className="mt-1 text-3xs text-[#E0A04A] bg-[#E0A04A]/10 px-2 py-0.5 rounded border border-[#E0A04A]/20 font-mono">
                      Region centre; results can differ strongly from the crest or evaluated site.
                    </div>
                  )}
                  <div className="text-3xs text-[#8A8A88] font-mono mt-0.5">
                    Daylight: 30-day window from {formatUtcDisplay(utcA)}, mast 1.5 m
                  </div>
                </div>

                {/* Notes if available */}
                {s.notes && (
                  <p className="mt-1.5 text-3xs text-[#8A8A88] line-clamp-2">
                    {s.notes}
                  </p>
                )}
              </div>

              {/* Integrity & Verification Badge */}
              <div className="mt-2.5 pt-2 border-t border-[#2A2D31] flex items-center justify-between">
                <div>
                  {s.verified ? (
                    <span className="text-3xs text-[#6DBF8B] flex items-center gap-1 font-medium font-mono">
                      ✓ Verified
                    </span>
                  ) : (
                    <span className="text-3xs text-[#E0A04A] flex items-center gap-1 font-mono">
                      ⚠️ Unverified
                    </span>
                  )}
                </div>

                {/* Scenario Assign Buttons */}
                <div className="flex items-center gap-1.5 font-mono">
                  <button
                    disabled={!hasCoords}
                    onClick={() => setScenarioA(s.id)}
                    className={`px-2 py-0.5 rounded text-3xs font-medium transition-colors ${
                      isA
                        ? 'bg-[#E0A04A] text-[#050608] font-bold'
                        : hasCoords
                        ? 'bg-[#E0A04A]/15 text-[#E0A04A] hover:bg-[#E0A04A]/30 border border-[#E0A04A]/40'
                        : 'opacity-40 cursor-not-allowed bg-[#171B22] text-[#6B6F75]'
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
                        ? 'bg-[#6FA8C9] text-[#050608] font-bold'
                        : hasCoords
                        ? 'bg-[#6FA8C9]/15 text-[#6FA8C9] hover:bg-[#6FA8C9]/30 border border-[#6FA8C9]/40'
                        : 'opacity-40 cursor-not-allowed bg-[#171B22] text-[#6B6F75]'
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
