import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'

interface MissionExplorerProps {
  sites: SelectableSite[]
  onAssignScenario?: (site: SelectableSite, type: 'A' | 'B') => void
}

export default function MissionExplorer({ sites, onAssignScenario }: MissionExplorerProps) {
  const { scenarioAId, scenarioBId, setScenarioA, setScenarioB } = useScenarioStore()
  const [search, setSearch] = useState('')
  const [detailSite, setDetailSite] = useState<SelectableSite | null>(null)
  type FilterType = 'all' | 'south_pole' | 'candidate' | 'mission' | 'landed' | 'planned'
  const [statusFilter, setStatusFilter] = useState<FilterType>('all')

  const assignScenario = (site: SelectableSite, type: 'A' | 'B') => {
    if (onAssignScenario) {
      onAssignScenario(site, type)
    } else if (type === 'A') {
      setScenarioA(site.id)
    } else {
      setScenarioB(site.id)
    }
  }

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
      const isSouthPolar = (s.lat !== null && s.lat <= -70) || (s.region_type && s.region_type.includes('polar'))
      const isFarside = s.region_type === 'farside'
      return isSouthPolar && !isFarside
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

      {/* Site rows - compact, 3-line scannable list */}
      <div className="flex flex-col gap-1.5 max-h-[560px] overflow-y-auto pr-1">
        {filtered.map((s) => {
          const isA = s.id === scenarioAId
          const isB = s.id === scenarioBId
          const hasCoords = s.lat !== null && s.lon !== null
          const isRegionCentre = s.coord_kind === 'region_centre' || s.coord_kind === 'planned_region_center'

          return (
            <div
              key={s.id}
              className={`px-3 py-2 rounded bg-[#050608] border transition-all flex flex-col gap-1 ${
                isA && isB
                  ? 'border-[#E0A04A] outline outline-1 outline-[#6FA8C9]'
                  : isA
                  ? 'border-[#E0A04A]'
                  : isB
                  ? 'border-[#6FA8C9]'
                  : 'border-[#2A2D31] hover:border-[#6B6F75]'
              }`}
            >
              {/* Line 1: Name + status badge */}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-[#E4E4E2] truncate">{s.name}</h3>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-3xs font-medium font-mono uppercase tracking-wider ${
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

              {/* Line 2: Lat/Lon + region-vs-specific pill */}
              <div className="flex items-center justify-between gap-2 text-3xs font-mono text-[#8A8A88]">
                <span className="truncate">
                  {hasCoords ? `${s.lat}°, ${s.lon}°` : 'Coordinates not published'}
                  {s.region_type ? ` · ${s.region_type.replace(/_/g, ' ')}` : ''}
                </span>
                {hasCoords && (
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded ${
                      isRegionCentre
                        ? 'text-[#E0A04A] bg-[#E0A04A]/10 border border-[#E0A04A]/20'
                        : 'text-[#8A8A88] bg-[#171B22] border border-[#2A2D31]'
                    }`}
                  >
                    {isRegionCentre ? 'Region centre' : 'Specific site'}
                  </span>
                )}
              </div>

              {/* Line 3: Set A | Set B | Details */}
              <div className="flex items-center justify-between gap-2 pt-1 mt-0.5 border-t border-[#2A2D31] font-mono">
                <div className="flex items-center gap-1 text-3xs">
                  {s.verified ? (
                    <span className="text-[#6DBF8B]">✓ Verified</span>
                  ) : (
                    <span className="text-[#E0A04A]">⚠️ Unverified</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-3xs">
                  <button
                    disabled={!hasCoords}
                    onClick={() => assignScenario(s, 'A')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
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
                    onClick={() => assignScenario(s, 'B')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
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
                  <button
                    type="button"
                    onClick={() => setDetailSite(s)}
                    className="px-1.5 py-0.5 rounded bg-[#171B22] hover:bg-[#2A2D31] text-[#E4E4E2] border border-[#2A2D31] transition-colors"
                  >
                    Details ↗
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Mission Detail Modal / Drawer */}
      {detailSite && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setDetailSite(null)}
        >
          <div
            className="relative bg-[#0D1014] border border-[#2A2D31] rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >

            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#2A2D31] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#E4E4E2]">
                    {detailSite.name}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded text-3xs font-mono uppercase tracking-wider ${
                      detailSite.status === 'landed_success'
                        ? 'bg-[#132A1C] text-[#6DBF8B] border border-[#2A5C3D]'
                        : detailSite.status === 'landed_partial'
                        ? 'bg-[#2A1210] text-[#E0A04A] border border-[#7F2318]'
                        : 'bg-[#171B22] text-[#B9A58C] border border-[#2A2D31]'
                    }`}
                  >
                    {detailSite.kind === 'candidate' ? 'Artemis Candidate' : detailSite.status?.replace('_', ' ') || 'Reference'}
                  </span>
                  {detailSite.verified && (
                    <span className="text-3xs text-[#6DBF8B] font-mono font-medium">
                      ✓ 2nd-Reviewer Verified
                    </span>
                  )}
                </div>
                <p className="text-2xs text-[#8A8A88] font-mono mt-0.5">
                  {detailSite.provider ? `${detailSite.provider} · Lander: ${detailSite.lander}` : 'Lunar Surface Target'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailSite(null)}
                className="w-7 h-7 flex items-center justify-center rounded bg-[#171B22] hover:bg-[#2A2D31] text-[#E4E4E2] text-sm font-mono border border-[#2A2D31]"
              >
                ✕
              </button>
            </div>

            {/* Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-3xs">
              <div className="p-2.5 bg-[#050608] rounded border border-[#2A2D31]">
                <span className="text-[#8A8A88] block mb-0.5">Coordinates</span>
                <span className="text-[#E4E4E2] font-semibold">
                  {detailSite.lat != null && detailSite.lon != null
                    ? `${detailSite.lat}°, ${detailSite.lon}°`
                    : 'Unpublished'}
                </span>
              </div>
              <div className="p-2.5 bg-[#050608] rounded border border-[#2A2D31]">
                <span className="text-[#8A8A88] block mb-0.5">Uncertainty Radius</span>
                <span className="text-[#E4E4E2] font-semibold">
                  {detailSite.uncertainty_km != null ? `±${detailSite.uncertainty_km} km` : 'Not specified'}
                </span>
              </div>
              <div className="p-2.5 bg-[#050608] rounded border border-[#2A2D31]">
                <span className="text-[#8A8A88] block mb-0.5">Elevation</span>
                <span className="text-[#E4E4E2] font-semibold">
                  {detailSite.elevation_m != null ? `${detailSite.elevation_m} m` : 'From DEM'}
                </span>
              </div>
              <div className="p-2.5 bg-[#050608] rounded border border-[#2A2D31]">
                <span className="text-[#8A8A88] block mb-0.5">Terrain Tier</span>
                <span className="text-[#6FA8C9] font-bold">
                  {detailSite.terrain_tier ?? 'T2'}
                </span>
              </div>
            </div>

            {/* Region Centre Caveat (moved here from card list; full detail lives in the modal only) */}
            {(detailSite.coord_kind === 'region_centre' || detailSite.coord_kind === 'planned_region_center') && (
              <div className="px-3 py-2 rounded bg-[#2A1210] border border-[#7F2318] text-3xs text-[#E0A04A] flex items-center gap-2 font-mono">
                <span className="font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E0A04A]/20 text-[#E0A04A] border border-[#E0A04A]/40 shrink-0">
                  Region Centre
                </span>
                <span>Results can differ strongly from the crest or evaluated site.</span>
              </div>
            )}

            {/* Mission Dates (if available) */}
            {detailSite.dates && (
              <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-1.5 font-mono text-3xs">
                <span className="text-[#8A8A88] uppercase tracking-wider font-semibold">Mission Schedule</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                  <div>
                    <span className="text-[#8A8A88]">Launch: </span>
                    <span className="text-[#E4E4E2] font-semibold">
                      {detailSite.dates.launch.date || 'TBD'}
                    </span>
                    {detailSite.dates.launch.kind && (
                      <span className="text-[#8A8A88] ml-1">({detailSite.dates.launch.kind}, {detailSite.dates.launch.precision})</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[#8A8A88]">Landing: </span>
                    <span className="text-[#E4E4E2] font-semibold">
                      {detailSite.dates.landing.date || 'TBD'}
                    </span>
                    {detailSite.dates.landing.kind && (
                      <span className="text-[#8A8A88] ml-1">({detailSite.dates.landing.kind}, {detailSite.dates.landing.precision})</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Payloads */}
            {detailSite.payload_highlights && detailSite.payload_highlights.length > 0 && (
              <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-1.5">
                <span className="text-3xs uppercase tracking-wider text-[#8A8A88] font-mono font-semibold">
                  Payload Highlights
                </span>
                <ul className="list-disc list-inside space-y-1 text-2xs text-[#E4E4E2]">
                  {detailSite.payload_highlights.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Notes */}
            {detailSite.notes && (
              <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-1 text-2xs">
                <span className="text-3xs uppercase tracking-wider text-[#8A8A88] font-mono font-semibold">
                  Description &amp; Context
                </span>
                <p className="text-[#E4E4E2] leading-relaxed">
                  {detailSite.notes}
                </p>
              </div>
            )}

            {/* Clickable Primary Sources */}
            <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-2">
              <span className="text-3xs uppercase tracking-wider text-[#8A8A88] font-mono font-semibold">
                Cited Primary Sources &amp; Verification Evidence
              </span>
              {detailSite.sources && detailSite.sources.length > 0 ? (
                <div className="space-y-2 font-mono text-3xs">
                  {detailSite.sources.map((src: any, idx: number) => (
                    <div key={idx} className="p-2 rounded bg-[#0D1014] border border-[#2A2D31] flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#6FA8C9] hover:underline font-semibold flex items-center gap-1 truncate"
                        >
                          <span>🔗</span> {src.title || src.url}
                        </a>
                        {src.accessed && (
                          <span className="text-[#8A8A88] shrink-0 ml-2">Accessed: {src.accessed}</span>
                        )}
                      </div>
                      {src.supports && (
                        <p className="text-[#8A8A88] font-sans text-3xs">
                          <strong className="text-[#6DBF8B]">Supports: </strong>{src.supports}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-3xs text-[#8A8A88] font-mono">No cited sources on file.</p>
              )}
            </div>

            {/* Drawer Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[#2A2D31] font-mono">
              <div className="flex items-center gap-2">
                <button
                  disabled={detailSite.lat == null}
                  onClick={() => {
                    assignScenario(detailSite, 'A')
                    setDetailSite(null)
                  }}
                  className="px-3 py-1.5 rounded bg-[#E0A04A] hover:bg-[#C88B35] text-[#050608] font-bold text-3xs disabled:opacity-40"
                >
                  Set as Scenario A
                </button>
                <button
                  disabled={detailSite.lat == null}
                  onClick={() => {
                    assignScenario(detailSite, 'B')
                    setDetailSite(null)
                  }}
                  className="px-3 py-1.5 rounded bg-[#6FA8C9] hover:bg-[#5A93B4] text-[#050608] font-bold text-3xs disabled:opacity-40"
                >
                  Set as Scenario B
                </button>
              </div>
              <button
                type="button"
                onClick={() => setDetailSite(null)}
                className="px-3 py-1.5 rounded bg-[#171B22] hover:bg-[#2A2D31] text-[#E4E4E2] text-3xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}