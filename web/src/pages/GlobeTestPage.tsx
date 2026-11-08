import { useEffect, useState, useMemo } from 'react'
import type { MissionsData, SelectableSite, CoordKind } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'
import LunarGlobe from '../components/LunarGlobe'

// Known verification landmarks to prove orientation
const TEST_VERIFICATION_LANDMARKS: SelectableSite[] = [
  {
    id: 'test-apollo-11',
    name: 'Apollo 11 Landing Site',
    kind: 'reference',
    lat: 0.67,
    lon: 23.47,
    isMission: true,
    coord_kind: 'actual',
    region_type: 'Mare Tranquillitatis',
    notes: 'Historic first crewed landing. Located in the dark basaltic plain of Mare Tranquillitatis (+23.47°E, just north of equator).',
  },
  {
    id: 'test-tycho',
    name: 'Tycho Crater Landmark',
    kind: 'reference',
    lat: -43.3,
    lon: -11.4,
    isMission: false,
    coord_kind: 'specific_site',
    region_type: 'Southern Highlands',
    notes: 'Prominent 85 km diameter impact crater with prominent radiating bright ray system in southern highlands (43.3°S, 11.4°W).',
  },
  {
    id: 'test-shackleton',
    name: 'Shackleton Crater Landmark',
    kind: 'reference',
    lat: -89.9,
    lon: 0.0,
    isMission: false,
    coord_kind: 'specific_site',
    region_type: 'South Pole',
    notes: 'South Pole impact crater (89.9°S, 0°E). The rim receives extended illumination while the floor is permanently shadowed.',
  },
]

export default function GlobeTestPage() {
  const [missionsData, setMissionsData] = useState<MissionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>('im-2')
  const [keyFilter, setKeyFilter] = useState<string>('')

  const { scenarioAId, scenarioBId, setScenarioA, setScenarioB } = useScenarioStore()

  useEffect(() => {
    fetch('/data/missions.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: MissionsData) => {
        setMissionsData(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load missions data')
        setLoading(false)
      })
  }, [])

  // Combine missions, candidate sites, reference sites, and orientation test landmarks
  const allSites: SelectableSite[] = useMemo(() => {
    if (!missionsData) return TEST_VERIFICATION_LANDMARKS

    const list: SelectableSite[] = [
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
        coord_kind: (c.coordinate_kind === 'specific_site' ? 'specific_site' : 'region_centre') as CoordKind,
        coord_status: (c.lat_center !== null && c.lon_center !== null ? 'ok' : 'skipped_null') as any,
        uncertainty_km: c.uncertainty_km,
        verified: c.verified ?? false,
        sources: c.sources,
        notes: c.notes,
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
        notes: r.note,
      })),
    ]

    // Ensure orientation test landmarks (Apollo 11, Tycho, Shackleton) are present
    TEST_VERIFICATION_LANDMARKS.forEach((mark) => {
      if (!list.some((s) => s.id === mark.id)) {
        list.push(mark)
      }
    })

    return list
  }, [missionsData])

  // Filter sites with valid coordinates
  const validSites = useMemo(
    () => allSites.filter((s) => s.lat !== null && s.lon !== null),
    [allSites]
  )

  // Assigned sequential numbering 1..N
  const numberedSites = useMemo(() => {
    return validSites.map((s, idx) => ({
      ...s,
      index: idx + 1,
    }))
  }, [validSites])

  const selectedSite = numberedSites.find((s) => s.id === selectedSiteId) || numberedSites[0]

  const filteredSites = useMemo(() => {
    if (!keyFilter.trim()) return numberedSites
    const q = keyFilter.toLowerCase()
    return numberedSites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        String(s.index).includes(q)
    )
  }, [numberedSites, keyFilter])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#8A8A88] gap-3">
        <div className="w-8 h-8 border-2 border-[#6FA8C9] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading 3D Lunar Globe &amp; mission coordinates...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-[#2A1210] border border-[#7F2318] rounded text-[#E5604A] max-w-lg mx-auto my-12 text-center">
        <h2 className="text-base font-semibold mb-1">Failed to Load Missions</h2>
        <p className="text-xs">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12 max-w-7xl mx-auto w-full">
      {/* Route Header Banner */}
      <div className="p-4 bg-[#0D1014] border border-[#2A2D31] rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-3xs font-semibold uppercase bg-[#E0A04A]/20 text-[#E0A04A] border border-[#E0A04A]/40 font-mono">
              Phase A Test Route: /globe-test
            </span>
            <span className="px-2 py-0.5 rounded text-3xs font-semibold uppercase bg-[#050608] text-[#8A8A88] border border-[#2A2D31] font-mono">
              Three.js WebGL Globe
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#E4E4E2]">
            3D Lunar Globe &amp; Orientation Proof
          </h1>
          <p className="text-xs text-[#8A8A88] mt-0.5 max-w-3xl">
            Interactive Three.js celestial sphere textured with NASA SVS CGI Moon Kit 2K (LROC WAC mosaic).
            Camera defaults to the south pole axis. User can rotate, zoom, and select candidate/reference landing sites.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-3xs font-mono text-[#8A8A88] bg-[#050608] px-3 py-2 rounded border border-[#2A2D31]">
          <div>
            <div>TEXTURE: 2048x1024 LROC</div>
            <div className="text-[#E4E4E2]">CENTER: 0° Lon (Near Side)</div>
          </div>
        </div>
      </div>

      {/* Main Grid: 3D Globe + Numbered Site Key beside it */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 3D Globe Viewport */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3">
          <LunarGlobe
            sites={validSites}
            selectedSiteId={selectedSiteId}
            onSelectSite={(site) => setSelectedSiteId(site.id)}
            scenarioAId={scenarioAId}
            scenarioBId={scenarioBId}
          />

          {/* Selected Site Detail Card */}
          {selectedSite && (
            <div className="p-4 bg-[#0D1014] border border-[#2A2D31] rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-sm bg-[#B9A58C] text-[#050608] font-bold font-mono text-xs flex items-center justify-center shrink-0">
                    {selectedSite.index}
                  </span>
                  <h3 className="font-semibold text-[#E4E4E2] text-sm">
                    {selectedSite.name}
                  </h3>
                  <span
                    className={`px-1.5 py-0.5 rounded text-3xs font-mono font-medium uppercase ${
                      selectedSite.coord_kind === 'specific_site' || selectedSite.coord_kind === 'actual'
                        ? 'bg-[#171B22] text-[#E4E4E2] border border-[#2A2D31]'
                        : 'bg-[#2A1210] text-[#E0A04A] border border-[#7F2318]'
                    }`}
                  >
                    {selectedSite.coord_kind === 'specific_site' || selectedSite.coord_kind === 'actual'
                      ? '● Specific Site'
                      : '◇ Region Centre'}
                  </span>
                </div>

                <div className="text-[#8A8A88] font-mono text-2xs">
                  Coordinates: {selectedSite.lat?.toFixed(4)}° Lat, {selectedSite.lon?.toFixed(4)}° Lon · {selectedSite.region_type || 'Lunar Surface'}
                </div>

                {selectedSite.notes && (
                  <p className="text-3xs text-[#8A8A88] max-w-xl">
                    {selectedSite.notes}
                  </p>
                )}

                {(selectedSite.coord_kind === 'region_centre' || selectedSite.coord_kind === 'planned_region_center') && (
                  <div className="text-3xs text-[#E0A04A] bg-[#E0A04A]/10 px-2 py-0.5 rounded border border-[#E0A04A]/20 inline-block font-mono">
                    Region centre; results can differ strongly from the crest or evaluated site.
                  </div>
                )}
              </div>

              {/* Wire to Scenario Store buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setScenarioA(selectedSite.id)}
                  className={`px-3 py-1.5 rounded font-mono text-xs font-semibold transition-colors ${
                    scenarioAId === selectedSite.id
                      ? 'bg-[#E0A04A] text-[#050608] border border-[#E0A04A]'
                      : 'bg-[#E0A04A]/15 hover:bg-[#E0A04A]/30 text-[#E0A04A] border border-[#E0A04A]/40'
                  }`}
                  aria-label={`Set ${selectedSite.name} as Scenario A`}
                >
                  Set Scenario A
                </button>
                <button
                  onClick={() => setScenarioB(selectedSite.id)}
                  className={`px-3 py-1.5 rounded font-mono text-xs font-semibold transition-colors ${
                    scenarioBId === selectedSite.id
                      ? 'bg-[#6FA8C9] text-[#050608] border border-[#6FA8C9]'
                      : 'bg-[#6FA8C9]/15 hover:bg-[#6FA8C9]/30 text-[#6FA8C9] border border-[#6FA8C9]/40'
                  }`}
                  aria-label={`Set ${selectedSite.name} as Scenario B`}
                >
                  Set Scenario B
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Numbered Key beside the globe */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col bg-[#0D1014] border border-[#2A2D31] rounded p-3 text-xs max-h-[720px] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#2A2D31] pb-2 mb-2">
            <div>
              <h2 className="font-semibold text-[#E4E4E2] uppercase tracking-wider text-2xs">
                Numbered Site Key ({numberedSites.length} Sites)
              </h2>
              <p className="text-3xs text-[#8A8A88]">
                Keyboard accessible list. Click to inspect on globe.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search sites..."
              value={keyFilter}
              onChange={(e) => setKeyFilter(e.target.value)}
              className="px-2 py-0.5 bg-[#050608] border border-[#2A2D31] rounded text-3xs text-[#E4E4E2] placeholder-[#6B6F75] focus:outline-none focus:border-[#B9A58C] w-28 font-mono"
              aria-label="Filter site key"
            />
          </div>

          {/* Scrollable List */}
          <div
            className="flex-1 overflow-y-auto space-y-1.5 pr-1 focus:outline-none"
            tabIndex={0}
            role="region"
            aria-label="Numbered lunar landing sites directory"
          >
            {filteredSites.map((site) => {
              const isA = site.id === scenarioAId
              const isB = site.id === scenarioBId
              const isSelected = site.id === selectedSiteId
              const isRegionCentre =
                site.coord_kind === 'region_centre' ||
                site.coord_kind === 'planned_region_center'

              let numBadge = 'bg-[#171B22] text-[#E4E4E2] border-[#2A2D31]'
              if (isA) numBadge = 'bg-[#E0A04A] text-[#050608] font-bold border-[#E0A04A]'
              else if (isB) numBadge = 'bg-[#6FA8C9] text-[#050608] font-bold border-[#6FA8C9]'

              return (
                <div
                  key={site.id}
                  onClick={() => setSelectedSiteId(site.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedSiteId(site.id)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  className={`p-2 rounded border transition-colors cursor-pointer flex flex-col gap-1.5 focus:outline-none focus:ring-1 focus:ring-[#B9A58C] ${
                    isSelected
                      ? 'bg-[#171B22] border-[#B9A58C]'
                      : isA
                      ? 'bg-[#E0A04A]/10 border-[#E0A04A]/40 hover:bg-[#171B22]'
                      : isB
                      ? 'bg-[#6FA8C9]/10 border-[#6FA8C9]/40 hover:bg-[#171B22]'
                      : 'bg-[#050608] border-[#2A2D31] hover:bg-[#13171E]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-sm border ${numBadge} text-[10px] font-mono font-bold flex items-center justify-center shrink-0`}
                      >
                        {site.index}
                      </span>
                      <span className="font-medium text-[#E4E4E2] truncate text-xs">
                        {site.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 font-mono">
                      {isA && (
                        <span className="px-1.5 py-0.2 rounded text-3xs font-bold bg-[#E0A04A] text-[#050608]">
                          A
                        </span>
                      )}
                      {isB && (
                        <span className="px-1.5 py-0.2 rounded text-3xs font-bold bg-[#6FA8C9] text-[#050608]">
                          B
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-3xs text-[#8A8A88] font-mono">
                    <span>
                      {site.lat?.toFixed(2)}° Lat, {site.lon?.toFixed(2)}° Lon
                    </span>
                    <span
                      className={`px-1 rounded ${
                        isRegionCentre
                          ? 'text-[#E0A04A] bg-[#2A1210] border border-[#7F2318]'
                          : 'text-[#E4E4E2] bg-[#171B22] border border-[#2A2D31]'
                      }`}
                    >
                      {isRegionCentre ? '◇ Region' : '● Site'}
                    </span>
                  </div>

                  {/* Quick Action buttons */}
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#2A2D31]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setScenarioA(site.id)
                      }}
                      className="px-2 py-0.5 rounded text-3xs font-mono font-medium bg-[#E0A04A]/15 hover:bg-[#E0A04A]/30 text-[#E0A04A] border border-[#E0A04A]/40 transition-colors"
                      aria-label={`Set ${site.name} as Scenario A`}
                    >
                      Set A
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setScenarioB(site.id)
                      }}
                      className="px-2 py-0.5 rounded text-3xs font-mono font-medium bg-[#6FA8C9]/15 hover:bg-[#6FA8C9]/30 text-[#6FA8C9] border border-[#6FA8C9]/40 transition-colors"
                      aria-label={`Set ${site.name} as Scenario B`}
                    >
                      Set B
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Orientation Proof & Ground Truth Verification Section */}
      <section className="p-5 bg-[#0D1014] border border-[#2A2D31] rounded flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🧭</span>
          <h2 className="text-sm font-semibold text-[#E4E4E2] uppercase tracking-wider">
            Orientation Proof: Verification Against Known Visible Lunar Features
          </h2>
        </div>
        <p className="text-xs text-[#8A8A88] leading-relaxed max-w-4xl">
          To prove the 3D WebGL sphere orientation is physically and cartographically correct without longitudinal mirroring, 90°/180° rotation errors, or inverted poles:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-2xs text-[#8A8A88] font-mono">
          <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-1">
            <span className="text-[#6FA8C9] font-bold text-xs font-sans">
              1. Apollo 11 (0.67°N, 23.47°E)
            </span>
            <div className="text-[#6B6F75] text-3xs">Feature: Mare Tranquillitatis</div>
            <p className="text-3xs text-[#8A8A88] font-sans leading-relaxed mt-1">
              Position: <span className="text-[#E4E4E2] font-mono">(X=+1.38, Y=+0.02, Z=-0.60)</span>.
              Sits directly inside the dark, low-albedo basaltic lava plains of Mare Tranquillitatis on the near-side eastern hemisphere (right of the central meridian, just north of the equator).
            </p>
          </div>

          <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-1">
            <span className="text-[#E0A04A] font-bold text-xs font-sans">
              2. Tycho Crater (43.3°S, 11.4°W)
            </span>
            <div className="text-[#6B6F75] text-3xs">Feature: Southern Highlands Ray System</div>
            <p className="text-3xs text-[#8A8A88] font-sans leading-relaxed mt-1">
              Position: <span className="text-[#E4E4E2] font-mono">(X=+1.07, Y=-1.03, Z=+0.22)</span>.
              Sits precisely on the prominent high-albedo 85 km impact crater and central peak in the southern highlands, southwest of Mare Nubium, with radiating brilliant white ejecta rays.
            </p>
          </div>

          <div className="p-3 bg-[#050608] rounded border border-[#2A2D31] flex flex-col gap-1">
            <span className="text-[#6DBF8B] font-bold text-xs font-sans">
              3. Shackleton (89.9°S, 0.0°E)
            </span>
            <div className="text-[#6B6F75] text-3xs">Feature: South Pole Axis</div>
            <p className="text-3xs text-[#8A8A88] font-sans leading-relaxed mt-1">
              Position: <span className="text-[#E4E4E2] font-mono">(X=+0.003, Y=-1.50, Z=0.00)</span>.
              Sits at the exact southern rotational axis (-Y) where the camera looks straight down in the default view, matching topocentric great-circle polar coordinates.
            </p>
          </div>
        </div>
      </section>

      <div className="text-center text-3xs font-mono text-[#8A8A88] pt-2">
        Moon surface: NASA SVS CGI Moon Kit (LRO). Visual backdrop only; results use LOLA elevation data.
      </div>
    </div>
  )
}
