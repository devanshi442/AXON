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

  // Fetch missions data for dynamic site counts
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

  const candidateCount = missionsData?.candidate_sites?.length ?? 10
  const referenceCount = missionsData?.reference_sites?.length ?? 2

  // Update layout debug attributes on mount & resize
  useEffect(() => {
    const updateDebug = () => {
      const el = document.getElementById('viewport-debug')
      const h1 = document.querySelector('.h1-hero') as HTMLElement
      if (el && h1) {
        const style = window.getComputedStyle(h1)
        el.setAttribute('data-scrollwidth', String(document.documentElement.scrollWidth))
        el.setAttribute('data-innerwidth', String(window.innerWidth))
        el.setAttribute('data-isfit', String(document.documentElement.scrollWidth <= window.innerWidth))
        el.setAttribute('data-fontfamily', style.fontFamily)
        el.setAttribute('data-fontsize', style.fontSize)
        el.setAttribute('data-fontweight', style.fontWeight)
      }
    }
    updateDebug()
    window.addEventListener('resize', updateDebug)
    return () => window.removeEventListener('resize', updateDebug)
  }, [])

  return (
    <main className="hero-landing">
      {/* Hidden debug element to report computed font and layout fit */}
      <div id="viewport-debug" className="sr-only" aria-hidden="true" />

      {/* Background Star field */}
      <div className="stars" aria-hidden="true" />

      {/* Moon at bottom center */}
      <div className="moon-hero">
        <img
          alt="The gibbous Moon against a black sky"
          aria-label="Rendering of the Moon"
          src="/images/moon.jpg"
        />
      </div>

      {/* Tan corner brackets (#B9A58C, 2px, ~7vw square, ~80% opacity) */}
      <i className="br-corner tl" aria-hidden="true" />
      <i className="br-corner tr" aria-hidden="true" />
      <i className="br-corner bl" aria-hidden="true" />
      <i className="br-corner brr" aria-hidden="true" />

      {/* Top HUD Bar */}
      <div className="hud-hero">
        <span>LUNARSIGHT</span>
        <span id="utc">{utcClock}</span>
      </div>

      {/* Title Section */}
      <section className="title-hero">
        <div className="kicker-hero">WHERE THE SUN REACHES THE</div>
        <h1 className="h1-hero">SOUTH POLE</h1>
        <div className="meta-hero">
          <div>
            <small>CANDIDATE SITES</small>
            <b>{candidateCount} + {referenceCount} reference</b>
          </div>
          <p>
            Terrain-aware sunlight and Earth line of sight for Artemis landing regions,
            from lunar elevation data.
          </p>
          <div className="r">
            <small>WINDOW</small>
            <b>2024 to 2028</b>
          </div>
        </div>
      </section>

      {/* Centred Action Button & Secondary Links */}
      <div
        className="flex flex-col items-center"
        style={{
          position: 'absolute',
          bottom: 'clamp(28px, 6vh, 60px)',
          zIndex: 3,
        }}
      >
        <Link to="/explorer" className="cta-hero" id="btn-open-explorer">
          OPEN THE EXPLORER
        </Link>
        <div className="mt-4 flex flex-col items-center gap-1 text-center font-mono text-3xs text-[#8A8A88]">
          <Link
            to="/methods"
            className="hover:text-[#B9A58C] underline underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#B9A58C]"
            style={{ textShadow: '0 1px 8px rgba(5,6,8,0.9)' }}
          >
            Methods and Limitations
          </Link>
          <span
            style={{
              textShadow: '0 1px 8px rgba(5,6,8,0.9)',
              opacity: 0.8,
              fontSize: '9px',
            }}
          >
            Moon surface: NASA SVS CGI Moon Kit (LRO). Visual backdrop only; results use
            LOLA elevation data.
          </span>
        </div>
      </div>
    </main>
  )
}
