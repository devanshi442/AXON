import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MissionsData } from '../types/mission'

function formatUtcClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
}

export default function LandingPage() {
  const [missionsData, setMissionsData] = useState<MissionsData | null>(null)
  const [utcClock, setUtcClock] = useState<string>(() => formatUtcClock(new Date()))

  useEffect(() => {
    fetch('/data/missions.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: MissionsData) => setMissionsData(data))
      .catch((err) => console.warn('Could not load missions.json on landing page', err))
  }, [])

  useEffect(() => {
    const update = () => setUtcClock(formatUtcClock(new Date()))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  const candidateCount = missionsData?.candidate_sites?.length ?? 10
  const referenceCount = missionsData?.reference_sites?.length ?? 2

  return (
    <main className="axon-landing">
      <div className="axon-landing-backdrop" aria-hidden="true" />
      <div className="axon-landing-vignette" aria-hidden="true" />
      <div className="axon-landing-stars" aria-hidden="true" />
      <svg className="axon-landing-contours" viewBox="0 0 920 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g>
          <path d="M360 40c110 80 124 130 220 130s144-62 270-18 145 132 100 208-112 88-120 168 56 130 132 198" />
          <path d="M330 22c112 82 145 148 241 148s144-62 270-18 145 132 100 208-112 88-120 168 56 130 132 198" />
          <path d="M300 4c112 82 165 166 261 166s144-62 270-18 145 132 100 208-112 88-120 168 56 130 132 198" />
          <path d="M270-14c112 82 185 184 281 184s144-62 270-18 145 132 100 208-112 88-120 168 56 130 132 198" />
          <path d="M240-32c112 82 205 202 301 202s144-62 270-18 145 132 100 208-112 88-120 168 56 130 132 198" />
          <path d="M210-50c112 82 225 220 321 220s144-62 270-18 145 132 100 208-112 88-120 168 56 130 132 198" />
          <path d="M180-68c112 82 245 238 341 238s144-62 270-18 145 132 100 208-112 88-120 168 56 130 132 198" />
        </g>
        <g className="axon-landing-contours-secondary">
          <path d="M560-40c-32 114 18 168 92 196s112 84 85 156-102 116-86 202 96 108 180 139" />
          <path d="M584-42c-32 114 18 168 92 196s112 84 85 156-102 116-86 202 96 108 180 139" />
          <path d="M608-44c-32 114 18 168 92 196s112 84 85 156-102 116-86 202 96 108 180 139" />
        </g>
      </svg>

      <header className="axon-landing-header">
        <Link to="/" className="axon-landing-brand" aria-label="AXON LunarSight home">
          <span className="axon-landing-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="10.5" />
              <path d="M3.8 10.2h20.4M3.8 17.8h20.4M14 3.5c4.1 4.7 4.1 16.3 0 21M14 3.5c-4.1 4.7-4.1 16.3 0 21" />
            </svg>
          </span>
          <span><strong>AXON</strong><small>LUNARSIGHT</small></span>
        </Link>
        <div className="axon-landing-clock">
          <span>MISSION INTELLIGENCE / LIVE UTC</span>
          <strong>{utcClock}</strong>
        </div>
      </header>

      <section className="axon-landing-copy">
        <div className="axon-landing-kicker"><i /> TERRAIN-AWARE MISSION ANALYSIS <span> / 01</span></div>
        <h1>THE SOUTH POLE.<br /><em>IN FULL VIEW.</em></h1>
        <p>
          Understand when sunlight reaches the surface and when Earth clears the horizon.
          Compare Artemis landing regions with terrain-aware lunar analysis.
        </p>

        <div className="axon-landing-metrics">
          <div><small>CANDIDATE SITES</small><strong>{candidateCount.toString().padStart(2, '0')}</strong></div>
          <div><small>REFERENCE SITES</small><strong>{referenceCount.toString().padStart(2, '0')}</strong></div>
          <div><small>ANALYSIS BASIS</small><strong>LOLA / SPICE</strong></div>
        </div>

        <div className="axon-landing-actions">
          <Link to="/explorer" className="axon-action-primary" id="btn-open-explorer">
            OPEN THE EXPLORER <span aria-hidden="true">↗</span>
          </Link>
          <Link to="/methods" className="axon-action-secondary">
            Methods and limitations <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="axon-landing-footer">
        <span>ARTEMIS SOUTH POLAR OPERATIONS</span>
        <span>LOLA ELEVATION · SPICE EPHEMERIDES · JPL HORIZONS VALIDATION</span>
        <span>{candidateCount + referenceCount} LOCATIONS IN VIEW</span>
      </footer>
    </main>
  )
}
