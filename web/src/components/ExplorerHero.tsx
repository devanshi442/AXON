export default function ExplorerHero() {
  return (
    <section className="axon-page-hero" aria-labelledby="explorer-page-title">
      <svg className="axon-page-hero-contours" viewBox="0 0 760 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g>
          <path d="M40 25c92 42 130 91 215 88s116-57 207-35 142 83 259 38" />
          <path d="M25 45c92 42 130 91 215 88s116-57 207-35 142 83 259 38" />
          <path d="M10 65c92 42 130 91 215 88s116-57 207-35 142 83 259 38" />
          <path d="M-5 85c92 42 130 91 215 88s116-57 207-35 142 83 259 38" />
          <path d="M-20 105c92 42 130 91 215 88s116-57 207-35 142 83 259 38" />
          <path d="M410-24c-23 66 11 109 76 132s97 71 61 117 6 75 79 110" />
          <path d="M430-35c-23 66 11 109 76 132s97 71 61 117 6 75 79 110" />
        </g>
      </svg>
      <div className="axon-page-hero-copy">
        <div className="axon-page-hero-eyebrow">MISSION INTELLIGENCE / SOUTH POLAR REGION</div>
        <h1 id="explorer-page-title">Lunar site explorer</h1>
        <p>Compare terrain-aware sunlight and Earth line-of-sight windows across candidate landing regions, mission sites and reference locations.</p>
        <div className="axon-page-hero-tags">
          <span>CLPS MISSION REGISTRY</span>
          <span>LOLA ELEVATION</span>
          <span>SPICE EPHEMERIDES</span>
        </div>
      </div>
    </section>
  )
}
