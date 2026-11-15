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
    { id: 'south_pole', label: 'South Pole (< -70°)' },
    { id: 'candidate', label: 'Artemis / Candidates' },
    { id: 'mission', label: 'CLPS Missions' },
    { id: 'landed', label: 'Landed' },
    { id: 'planned', label: 'Planned' },
  ]

  return (
    <div className="relative bg-[#18191B] border border-[#363A3F] rounded p-4 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#EDEEF0] uppercase tracking-wider flex items-center gap-1.5">
            <span></span> Lunar Landing Sites Directory
          </h2>
          <p className="text-2xs text-[#AFB3BA] mt-0.5">
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
            className="w-full px-3 py-1.5 pl-8 bg-[#111113] border border-[#363A3F] rounded text-xs text-[#EDEEF0] placeholder-[#AFB3BA] focus:outline-none focus:border-[#638BFF] transition-colors font-mono"
          />
          <svg className="w-4 h-4 text-[#AFB3BA] absolute left-2.5 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  ? 'bg-[#E9AD51]/20 text-[#E9AD51] border border-[#E9AD51]/50'
                  : opt.id === 'candidate'
                  ? 'bg-[#638BFF]/20 text-[#638BFF] border border-[#638BFF]/50'
                  : 'bg-[#638BFF]/20 text-[#638BFF] border border-[#638BFF]/40'
                : 'bg-[#111113] text-[#AFB3BA] hover:text-[#EDEEF0] border border-[#363A3F]'
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
              className={`px-3 py-2 rounded bg-[#111113] border transition-all flex flex-col gap-1 ${
                isA && isB
                  ? 'border-[#E9AD51] outline outline-1 outline-[#638BFF]'
                  : isA
                  ? 'border-[#E9AD51]'
                  : isB
                  ? 'border-[#638BFF]'
                  : 'border-[#363A3F] hover:border-[#777D86]'
              }`}
            >
              {/* Line 1: Name + status badge */}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-[#EDEEF0] truncate">{s.name}</h3>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-3xs font-medium font-mono uppercase tracking-wider ${
                    s.status === 'landed_success'
                      ? 'bg-[#132A1C] text-[#30C48D] border border-[#2A5C3D]'
                      : s.status === 'landed_partial'
                      ? 'bg-[#2A1210] text-[#E9AD51] border border-[#7F2318]'
                      : s.status === 'planned' || s.kind === 'candidate'
                      ? 'bg-[#272A2D] text-[#638BFF] border border-[#363A3F]'
                      : 'bg-[#272A2D] text-[#AFB3BA] border border-[#363A3F]'
                  }`}
                >
                  {s.kind === 'candidate' ? 'Candidate' : (s.status?.replace('_', ' ') || 'Reference')}
                </span>
              </div>

              {/* Line 2: Lat/Lon + region-vs-specific pill */}
              <div className="flex items-center justify-between gap-2 text-3xs font-mono text-[#AFB3BA]">
                <span className="truncate">
                  {hasCoords ? `${s.lat}°, ${s.lon}°` : 'Coordinates not published'}
                  {s.region_type ? ` · ${s.region_type.replace(/_/g, ' ')}` : ''}
                </span>
                {hasCoords && (
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded ${
                      isRegionCentre
                        ? 'text-[#E9AD51] bg-[#E9AD51]/10 border border-[#E9AD51]/20'
                        : 'text-[#AFB3BA] bg-[#272A2D] border border-[#363A3F]'
                    }`}
                  >
                    {isRegionCentre ? 'Region centre' : 'Specific site'}
                  </span>
                )}
              </div>

              {/* Line 3: Set A | Set B | Details */}
              <div className="flex items-center justify-between gap-2 pt-1 mt-0.5 border-t border-[#363A3F] font-mono">
                <div className="flex items-center gap-1 text-3xs">
                  {s.verified ? (
                    <span className="text-[#30C48D]"> Verified</span>
                  ) : (
                    <span className="text-[#E9AD51]">Unverified</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-3xs">
                  <button
                    disabled={!hasCoords}
                    onClick={() => assignScenario(s, 'A')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      isA
                        ? 'bg-[#E9AD51] text-[#111113] font-bold'
                        : hasCoords
                        ? 'bg-[#E9AD51]/15 text-[#E9AD51] hover:bg-[#E9AD51]/30 border border-[#E9AD51]/40'
                        : 'opacity-40 cursor-not-allowed bg-[#272A2D] text-[#777D86]'
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
                        ? 'bg-[#638BFF] text-[#111113] font-bold'
                        : hasCoords
                        ? 'bg-[#638BFF]/15 text-[#638BFF] hover:bg-[#638BFF]/30 border border-[#638BFF]/40'
                        : 'opacity-40 cursor-not-allowed bg-[#272A2D] text-[#777D86]'
                    }`}
                    title={hasCoords ? 'Set as Scenario B' : 'Cannot compute geometry: coordinates not published'}
                  >
                    Set B
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailSite(s)}
                    className="px-1.5 py-0.5 rounded bg-[#272A2D] hover:bg-[#363A3F] text-[#EDEEF0] border border-[#363A3F] transition-colors"
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
            className="relative bg-[#18191B] border border-[#363A3F] rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >

            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#363A3F] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#EDEEF0]">
                    {detailSite.name}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded text-3xs font-mono uppercase tracking-wider ${
                      detailSite.status === 'landed_success'
                        ? 'bg-[#132A1C] text-[#30C48D] border border-[#2A5C3D]'
                        : detailSite.status === 'landed_partial'
                        ? 'bg-[#2A1210] text-[#E9AD51] border border-[#7F2318]'
                        : 'bg-[#272A2D] text-[#638BFF] border border-[#363A3F]'
                    }`}
                  >
                    {detailSite.kind === 'candidate' ? 'Artemis Candidate' : detailSite.status?.replace('_', ' ') || 'Reference'}
                  </span>
                  {detailSite.verified && (
                    <span className="text-3xs text-[#30C48D] font-mono font-medium">
                       2nd-Reviewer Verified
                    </span>
                  )}
                </div>
                <p className="text-2xs text-[#AFB3BA] font-mono mt-0.5">
                  {detailSite.provider ? `${detailSite.provider} · Lander: ${detailSite.lander}` : 'Lunar Surface Target'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailSite(null)}
                className="w-7 h-7 flex items-center justify-center rounded bg-[#272A2D] hover:bg-[#363A3F] text-[#EDEEF0] text-sm font-mono border border-[#363A3F]"
              >
                ✕
              </button>
            </div>

            {/* Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-3xs">
              <div className="p-2.5 bg-[#111113] rounded border border-[#363A3F]">
                <span className="text-[#AFB3BA] block mb-0.5">Coordinates</span>
                <span className="text-[#EDEEF0] font-semibold">
                  {detailSite.lat != null && detailSite.lon != null
                    ? `${detailSite.lat}°, ${detailSite.lon}°`
                    : 'Unpublished'}
                </span>
              </div>
              <div className="p-2.5 bg-[#111113] rounded border border-[#363A3F]">
                <span className="text-[#AFB3BA] block mb-0.5">Uncertainty Radius</span>
                <span className="text-[#EDEEF0] font-semibold">
                  {detailSite.uncertainty_km != null ? `±${detailSite.uncertainty_km} km` : 'Not specified'}
                </span>
              </div>
              <div className="p-2.5 bg-[#111113] rounded border border-[#363A3F]">
                <span className="text-[#AFB3BA] block mb-0.5">Elevation</span>
                <span className="text-[#EDEEF0] font-semibold">
                  {detailSite.elevation_m != null ? `${detailSite.elevation_m} m` : 'From DEM'}
                </span>
              </div>
              <div className="p-2.5 bg-[#111113] rounded border border-[#363A3F]">
                <span className="text-[#AFB3BA] block mb-0.5">Terrain Tier</span>
                <span className="text-[#638BFF] font-bold">
                  {detailSite.terrain_tier ?? 'T2'}
                </span>
              </div>
            </div>

            {/* Region Centre Caveat (moved here from card list; full detail lives in the modal only) */}
            {(detailSite.coord_kind === 'region_centre' || detailSite.coord_kind === 'planned_region_center') && (
              <div className="px-3 py-2 rounded bg-[#2A1210] border border-[#7F2318] text-3xs text-[#E9AD51] flex items-center gap-2 font-mono">
                <span className="font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E9AD51]/20 text-[#E9AD51] border border-[#E9AD51]/40 shrink-0">
                  Region Centre
                </span>
                <span>Results can differ strongly from the crest or evaluated site.</span>
              </div>
            )}

            {/* Mission Dates (if available) */}
            {detailSite.dates && (
              <div className="p-3 bg-[#111113] rounded border border-[#363A3F] flex flex-col gap-1.5 font-mono text-3xs">
                <span className="text-[#AFB3BA] uppercase tracking-wider font-semibold">Mission Schedule</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
                  <div>
                    <span className="text-[#AFB3BA]">Launch: </span>
                    <span className="text-[#EDEEF0] font-semibold">
                      {detailSite.dates.launch.date || 'TBD'}
                    </span>
                    {detailSite.dates.launch.kind && (
                      <span className="text-[#AFB3BA] ml-1">({detailSite.dates.launch.kind}, {detailSite.dates.launch.precision})</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[#AFB3BA]">Landing: </span>
                    <span className="text-[#EDEEF0] font-semibold">
                      {detailSite.dates.landing.date || 'TBD'}
                    </span>
                    {detailSite.dates.landing.kind && (
                      <span className="text-[#AFB3BA] ml-1">({detailSite.dates.landing.kind}, {detailSite.dates.landing.precision})</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Payloads */}
            {detailSite.payload_highlights && detailSite.payload_highlights.length > 0 && (
              <div className="p-3 bg-[#111113] rounded border border-[#363A3F] flex flex-col gap-1.5">
                <span className="text-3xs uppercase tracking-wider text-[#AFB3BA] font-mono font-semibold">
                  Payload Highlights
                </span>
                <ul className="list-disc list-inside space-y-1 text-2xs text-[#EDEEF0]">
                  {detailSite.payload_highlights.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Notes */}
            {detailSite.notes && (
              <div className="p-3 bg-[#111113] rounded border border-[#363A3F] flex flex-col gap-1 text-2xs">
                <span className="text-3xs uppercase tracking-wider text-[#AFB3BA] font-mono font-semibold">
                  Description &amp; Context
                </span>
                <p className="text-[#EDEEF0] leading-relaxed">
                  {detailSite.notes}
                </p>
              </div>
            )}

            {/* Clickable Primary Sources */}
            <div className="p-3 bg-[#111113] rounded border border-[#363A3F] flex flex-col gap-2">
              <span className="text-3xs uppercase tracking-wider text-[#AFB3BA] font-mono font-semibold">
                Cited Primary Sources &amp; Verification Evidence
              </span>
              {detailSite.sources && detailSite.sources.length > 0 ? (
                <div className="space-y-2 font-mono text-3xs">
                  {detailSite.sources.map((src: any, idx: number) => (
                    <div key={idx} className="p-2 rounded bg-[#18191B] border border-[#363A3F] flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#638BFF] hover:underline font-semibold flex items-center gap-1 truncate"
                        >
                          <span></span> {src.title || src.url}
                        </a>
                        {src.accessed && (
                          <span className="text-[#AFB3BA] shrink-0 ml-2">Accessed: {src.accessed}</span>
                        )}
                      </div>
                      {src.supports && (
                        <p className="text-[#AFB3BA] font-sans text-3xs">
                          <strong className="text-[#30C48D]">Supports: </strong>{src.supports}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-3xs text-[#AFB3BA] font-mono">No cited sources on file.</p>
              )}
            </div>

            {/* Drawer Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[#363A3F] font-mono">
              <div className="flex items-center gap-2">
                <button
                  disabled={detailSite.lat == null}
                  onClick={() => {
                    assignScenario(detailSite, 'A')
                    setDetailSite(null)
                  }}
                  className="px-3 py-1.5 rounded bg-[#E9AD51] hover:bg-[#C88B35] text-[#111113] font-bold text-3xs disabled:opacity-40"
                >
                  Set as Scenario A
                </button>
                <button
                  disabled={detailSite.lat == null}
                  onClick={() => {
                    assignScenario(detailSite, 'B')
                    setDetailSite(null)
                  }}
                  className="px-3 py-1.5 rounded bg-[#638BFF] hover:bg-[#5A93B4] text-[#111113] font-bold text-3xs disabled:opacity-40"
                >
                  Set as Scenario B
                </button>
              </div>
              <button
                type="button"
                onClick={() => setDetailSite(null)}
                className="px-3 py-1.5 rounded bg-[#272A2D] hover:bg-[#363A3F] text-[#EDEEF0] text-3xs"
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