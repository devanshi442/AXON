import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { MissionsData, SelectableSite } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'
import LunarGlobe from '../components/LunarGlobe'

function formatUtcClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { setScenarioA, scenarioAId, scenarioBId } = useScenarioStore()
  const [missionsData, setMissionsData] = useState<MissionsData | null>(null)
  const [utcClock, setUtcClock] = useState<string>(() => formatUtcClock(new Date()))

  // Fetch missions data for site counts and globe markers
  useEffect(() => {
    fetch('/data/missions.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: MissionsData) => {
        setMissionsData(data)
      })
      .catch((err) => {
        console.warn('Could not load missions.json on landing page', err)
      })
  }, [])

  // Live UTC Clock updater
  useEffect(() => {
    const update = () => setUtcClock(formatUtcClock(new Date()))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  // Site counts read dynamically from missions.json
  const candidateCount = missionsData?.candidate_sites?.length ?? 10
  const referenceCount = missionsData?.reference_sites?.length ?? 2

  // Selectable sites for 3D Globe
  const validSites: SelectableSite[] = useMemo(() => {
    if (!missionsData) return []
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
        coord_kind: (c.coordinate_kind === 'specific_site' ? 'specific_site' : 'region_centre') as any,
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
    return list.filter((s) => s.lat !== null && s.lon !== null)
  }, [missionsData])

  const handleSelectMarker = (site: SelectableSite) => {
    setScenarioA(site.id)
    navigate('/explorer')
  }

  return (
    <div className="min-h-screen bg-[#050608] text-[#E4E4E2] flex flex-col justify-between relative overflow-hidden select-none">
      {/* Decorative Corner Brackets (Tan #B9A58C) */}
      <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-[#B9A58C] pointer-events-none z-20" aria-hidden="true" />
      <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-[#B9A58C] pointer-events-none z-20" aria-hidden="true" />
      <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-[#B9A58C] pointer-events-none z-20" aria-hidden="true" />
      <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-[#B9A58C] pointer-events-none z-20" aria-hidden="true" />

      {/* Top HUD Bar */}
      <header className="w-full max-w-7xl mx-auto px-6 pt-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#B9A58C]" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" strokeLinecap="round" />
          </svg>
          <span className="font-mono text-xs tracking-widest text-[#B9A58C] font-bold">
            AXON LUNARSIGHT
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <Link
            to="/explorer"
            className="text-[#8A8A88] hover:text-[#E4E4E2] transition-colors"
          >
            Explorer
          </Link>
          <Link
            to="/methods"
            className="text-[#8A8A88] hover:text-[#E4E4E2] transition-colors"
          >
            Methods
          </Link>
          <span className="text-[#6B6F75]">|</span>
          <span
            id="utc"
            className="text-[#E0A04A] font-semibold tracking-wider text-2xs"
            aria-label={`Current time: ${utcClock}`}
          >
            {utcClock}
          </span>
        </div>
      </header>

      {/* Main Hero Body */}
      <main className="w-full max-w-7xl mx-auto px-6 py-6 flex-1 flex flex-col lg:flex-row items-center justify-between gap-8 z-10">
        {/* Left Hero Column: Typography & CTAs */}
        <section className="flex flex-col gap-5 max-w-xl text-left" aria-label="Hero header">
          <div className="space-y-1">
            <div className="text-3xs sm:text-2xs font-mono font-semibold tracking-widest text-[#B9A58C] uppercase">
              WHERE THE SUN REACHES THE
            </div>
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-[#E4E4E2] leading-none whitespace-nowrap">
              SOUTH POLE
            </h1>
          </div>

          <p className="text-xs sm:text-sm text-[#8A8A88] leading-relaxed">
            Terrain-aware sunlight and Earth line of sight for Artemis landing regions,
            from lunar elevation data.
          </p>

          {/* Meta strip read dynamically from missions.json */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-[#0D1014] border border-[#2A2D31] rounded">
            <div>
              <div className="text-3xs uppercase font-mono text-[#8A8A88]">CANDIDATE SITES</div>
              <div className="text-xs font-mono font-bold text-[#E4E4E2] mt-0.5">
                {candidateCount} + {referenceCount} reference
              </div>
            </div>
            <div>
              <div className="text-3xs uppercase font-mono text-[#8A8A88]">EVALUATION WINDOW</div>
              <div className="text-xs font-mono font-bold text-[#E4E4E2] mt-0.5">
                2024 to 2028
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              to="/explorer"
              id="btn-open-explorer"
              className="px-6 py-3 rounded bg-[#E0A04A] hover:bg-[#C88B35] text-[#050608] font-mono text-xs font-bold tracking-wider uppercase transition-colors"
            >
              Open the Explorer
            </Link>
            <Link
              to="/methods"
              className="px-4 py-3 rounded bg-[#0D1014] hover:bg-[#171B22] text-[#E4E4E2] border border-[#2A2D31] font-mono text-xs font-medium transition-colors"
            >
              Methods &amp; Limitations
            </Link>
          </div>

          <div className="text-3xs font-mono text-[#6B6F75]">
            Click any pin on the 3D globe to launch directly into site analysis.
          </div>
        </section>

        {/* Right Hero Column: 3D Globe with Slow Auto-Rotation */}
        <section className="w-full lg:w-1/2 flex flex-col items-center justify-center relative max-w-lg">
          <div className="w-full aspect-square relative rounded border border-[#2A2D31] bg-[#050608] overflow-hidden">
            <LunarGlobe
              sites={validSites}
              selectedSiteId={scenarioAId}
              onSelectSite={handleSelectMarker}
              scenarioAId={scenarioAId}
              scenarioBId={scenarioBId}
              autoRotate={true}
              autoRotateSpeed={0.35}
              heightClass="h-full min-h-[340px] sm:min-h-[440px]"
              showControls={false}
              compact={true}
            />
          </div>

          {/* Under-Globe Hint */}
          <div className="mt-2 text-3xs font-mono text-[#8A8A88] flex items-center justify-between w-full px-1">
            <span>🏔️ South-polar perspective · Drag to rotate · Pinch/scroll to zoom</span>
            <span className="text-[#E0A04A]">● Live 3D Globe</span>
          </div>
        </section>
      </main>

      {/* Footer Credit Line */}
      <footer className="w-full max-w-7xl mx-auto px-6 pb-4 pt-2 text-center text-3xs font-mono text-[#8A8A88] border-t border-[#2A2D31]/50 z-20">
        <div>
          Moon surface: NASA SVS CGI Moon Kit (LRO). Visual backdrop only; results use LOLA elevation data.
        </div>
        <div className="text-[#6B6F75] mt-0.5">
          AXON LunarSight · NASA Space Apps Challenge 2026 · Geometry is not a link budget or mission recommendation.
        </div>
      </footer>
    </div>
  )
}

