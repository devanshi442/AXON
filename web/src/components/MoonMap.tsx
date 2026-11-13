import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'

interface MoonMapProps {
  sites: SelectableSite[]
  onPickCoords?: (lat: number, lon: number) => void
  onSelectSite?: (site: SelectableSite) => void
}

export default function MoonMap({ sites, onPickCoords, onSelectSite }: MoonMapProps) {
  const { scenarioAId, scenarioBId } = useScenarioStore()
  const [hoveredSite, setHoveredSite] = useState<SelectableSite | null>(null)

  // South Polar Stereographic (lat <= -70°):
  // Center: (50%, 50%) is South Pole (-90°)
  // Range: 90° to 70°S = 20° span mapped to radius R = 42%
  const toPolarCoord = (lat: number, lon: number) => {
    const rFrac = Math.max(0, Math.min(1.0, (lat - (-90.0)) / 20.0))
    const rPct = rFrac * 42.0 // radius in percentage
    const thetaRad = ((lon - 90.0) * Math.PI) / 180.0 // orient 0° Lon up
    const x = 50.0 + rPct * Math.cos(thetaRad)
    const y = 50.0 + rPct * Math.sin(thetaRad)
    return { x, y }
  }

  // Filter sites with valid coordinates
  const mappableSites = sites.filter((s) => s.lat !== null && s.lon !== null)
  const polarSites = mappableSites.filter((s) => s.lat !== null && s.lat <= -70)

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If user clicked on a pin marker or its children, don't trigger coordinate picking
    if ((e.target as HTMLElement).closest('.site-marker-pin')) {
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const yPct = ((e.clientY - rect.top) / rect.height) * 100

    const dxPct = xPct - 50.0
    const dyPct = yPct - 50.0
    const distPct = Math.sqrt(dxPct * dxPct + dyPct * dyPct)
    const rFrac = Math.min(1.0, distPct / 42.0)
    const lat = Number((-90.0 + rFrac * 20.0).toFixed(2))

    const thetaRad = Math.atan2(dyPct, dxPct)
    let lonCalc = (thetaRad * 180.0) / Math.PI + 90.0
    while (lonCalc > 180) lonCalc -= 360
    while (lonCalc < -180) lonCalc += 360
    const lon = Number(lonCalc.toFixed(2))

    if (onPickCoords) {
      onPickCoords(lat, lon)
    }
  }

  return (
    <div className="bg-[#0D1014] border border-[#2A2D31] rounded p-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#6FA8C9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" strokeLinecap="round" />
          </svg>
          <h2 className="text-sm font-semibold text-[#E4E4E2] uppercase tracking-wider">
            South Polar Stereographic Map
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-3xs font-mono text-[#8A8A88] bg-[#050608] px-2 py-1 rounded border border-[#2A2D31]">
            Range: 70°S – 90°S Latitude | -180° – +180° Longitude
          </div>
          <div className="flex items-center gap-3 text-3xs">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E0A04A]"></span>
              <span className="text-[#E0A04A]">Scenario A</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#6FA8C9]"></span>
              <span className="text-[#6FA8C9]">Scenario B</span>
            </div>
          </div>
        </div>
      </div>

      <div
        onClick={handleMapClick}
        className="relative w-full aspect-[2/1] bg-[#050608] rounded overflow-hidden border border-[#2A2D31] select-none group cursor-crosshair"
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 100">
          {/* Range Rings around South Pole (center: 100, 50) */}
          {/* -70° outer boundary (r = 42) */}
          <circle cx="100" cy="50" r="42" fill="#090C10" stroke="#2A2D31" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.8" />
          <text x="100" y="9" fill="#8A8A88" fontSize="3" textAnchor="middle">70°S Outer Limit</text>

          {/* -75° ring (r = 31.5) */}
          <circle cx="100" cy="50" r="31.5" fill="none" stroke="#2A2D31" strokeWidth="0.4" strokeDasharray="1.5,1.5" />
          <text x="100" y="20.5" fill="#6B6F75" fontSize="2.6" textAnchor="middle">75°S</text>

          {/* -80° ring (r = 21) */}
          <circle cx="100" cy="50" r="21" fill="none" stroke="#2A2D31" strokeWidth="0.4" strokeDasharray="1.5,1.5" />
          <text x="100" y="31" fill="#6B6F75" fontSize="2.6" textAnchor="middle">80°S</text>

          {/* -85° ring (r = 10.5) */}
          <circle cx="100" cy="50" r="10.5" fill="none" stroke="#2A2D31" strokeWidth="0.4" strokeDasharray="1,1" />
          <text x="100" y="41" fill="#8A8A88" fontSize="2.4" textAnchor="middle">85°S</text>

          {/* South Pole (center: 100, 50) */}
          <circle cx="100" cy="50" r="1.5" fill="#E0A04A" />
          <line x1="100" y1="8" x2="100" y2="92" stroke="#171B22" strokeWidth="0.4" />
          <line x1="58" y1="50" x2="142" y2="50" stroke="#171B22" strokeWidth="0.4" />

          {/* Major Crater Annotations */}
          <text x="100" y="54" fill="#E0A04A" fontSize="3" fontWeight="bold" textAnchor="middle">Shackleton Rim (90°S)</text>
          <text x="108" y="38" fill="#8A8A88" fontSize="2.6" textAnchor="middle">Malapert Massif (-85.9°)</text>
          <text x="88" y="38" fill="#8A8A88" fontSize="2.6" textAnchor="middle">Mons Mouton (-84.8°)</text>
          <text x="115" y="58" fill="#8A8A88" fontSize="2.6" textAnchor="middle">Nobile Rim (-85.3°)</text>
          <text x="82" y="58" fill="#8A8A88" fontSize="2.6" textAnchor="middle">Haworth (-87.4°)</text>
        </svg>

        {polarSites.map((site) => {
          const isA = site.id === scenarioAId
          const isB = site.id === scenarioBId
          const isBoth = isA && isB

          const pos = toPolarCoord(site.lat!, site.lon!)

          let markerColor = 'bg-white ring-1 ring-[#8A8A88]'
          if (isBoth) {
            markerColor = 'bg-[#E0A04A] ring-2 ring-[#6FA8C9]'
          } else if (isA) {
            markerColor = 'bg-[#E0A04A] ring-2 border border-white'
          } else if (isB) {
            markerColor = 'bg-[#6FA8C9] ring-2 border border-white'
          } else if (site.kind === 'candidate') {
            markerColor = 'bg-white ring-1 ring-[#B9A58C]'
          }

          return (
            <div
              key={site.id}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className="site-marker-pin absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition-transform duration-150 hover:scale-125"
              onClick={() => onSelectSite && onSelectSite(site)}
              onMouseEnter={() => setHoveredSite(site)}
              onMouseLeave={() => setHoveredSite(null)}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full ${markerColor} flex items-center justify-center`}
                title={`${site.name} (${site.lat}°, ${site.lon}°)`}
              >
                {site.kind === 'candidate' ? (
                  <div className="w-1.5 h-1.5 bg-[#050608] rounded-full"></div>
                ) : site.coord_kind === 'actual' ? (
                  <div className="w-1 h-1 bg-white rounded-full"></div>
                ) : (
                  <div className="w-1 h-1 border border-white rounded-full"></div>
                )}
              </div>
            </div>
          )
        })}

        <div className="absolute bottom-2 left-2 px-2 py-1 bg-[#050608]/90 border border-[#2A2D31] rounded text-3xs text-[#8A8A88] font-mono">
          Click map or pins to select coordinates
        </div>

        {hoveredSite && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-[#050608]/90 border border-[#2A2D31] rounded text-3xs text-[#E4E4E2] font-mono pointer-events-none">
            {hoveredSite.name} · {hoveredSite.lat}°, {hoveredSite.lon}°
          </div>
        )}
      </div>
    </div>
  )
}