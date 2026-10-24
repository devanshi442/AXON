import { useState } from 'react'
import type { SelectableSite } from '../types/mission'
import { useScenarioStore } from '../stores/scenarioStore'

interface MoonMapProps {
  sites: SelectableSite[]
}

export default function MoonMap({ sites }: MoonMapProps) {
  const { scenarioAId, scenarioBId, setScenarioA, setScenarioB } = useScenarioStore()
  const [hoveredSite, setHoveredSite] = useState<SelectableSite | null>(null)
  const [selectedPin, setSelectedPin] = useState<SelectableSite | null>(null)

  // Map projection: Equirectangular
  // Lon: -180..180 -> X: 0..100%
  // Lat: -90..90   -> Y: 100%..0% (North at top, South at bottom)
  const toX = (lon: number) => ((lon + 180) / 360) * 100
  const toY = (lat: number) => ((90 - lat) / 180) * 100

  // Filter sites with valid coordinates
  const mappableSites = sites.filter((s) => s.lat !== null && s.lon !== null)

  const activePin = selectedPin || hoveredSite

  return (
    <div className="bg-space-800 border border-space-700 rounded-2xl p-4 flex flex-col gap-3 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-earth-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" strokeLinecap="round" />
          </svg>
          <h2 className="text-sm font-semibold text-space-100 uppercase tracking-wider">
            Lunar Surface Map (Equirectangular)
          </h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sun-500 ring-2 ring-sun-500/30"></span>
            <span className="text-sun-400">Scenario A</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-earth-500 ring-2 ring-earth-500/30"></span>
            <span className="text-earth-400">Scenario B</span>
          </div>
        </div>
      </div>

      {/* Map viewport */}
      <div className="relative w-full aspect-[2/1] bg-space-950 rounded-xl overflow-hidden border border-space-700/80 select-none group">
        {/* Graticule lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" viewBox="0 0 360 180" preserveAspectRatio="none">
          {/* Latitude lines */}
          {[-60, -30, 0, 30, 60].map((lat) => (
            <line
              key={`lat-${lat}`}
              x1="0"
              y1={90 - lat}
              x2="360"
              y2={90 - lat}
              stroke="#64748b"
              strokeDasharray={lat === 0 ? "none" : "2,2"}
              strokeWidth={lat === 0 ? "0.75" : "0.5"}
            />
          ))}
          {/* Longitude lines */}
          {[-120, -60, 0, 60, 120].map((lon) => (
            <line
              key={`lon-${lon}`}
              x1={lon + 180}
              y1="0"
              x2={lon + 180}
              y2="180"
              stroke="#64748b"
              strokeDasharray={lon === 0 ? "none" : "2,2"}
              strokeWidth={lon === 0 ? "0.75" : "0.5"}
            />
          ))}
          {/* Major feature approximations */}
          {/* Mare Crisium */}
          <ellipse cx="242" cy="72" rx="14" ry="12" fill="#1e293b" opacity="0.6" />
          <text x="242" y="73" fill="#94a3b8" fontSize="4" textAnchor="middle">Mare Crisium</text>
          {/* Mare Tranquillitatis */}
          <ellipse cx="203" cy="82" rx="18" ry="14" fill="#1e293b" opacity="0.6" />
          <text x="203" y="83" fill="#94a3b8" fontSize="4" textAnchor="middle">Tranquillitatis</text>
          {/* South Pole polar zone highlight (< -70° lat, y >= 160) */}
          <rect x="0" y="160" width="360" height="20" fill="#0284c7" opacity="0.12" />
          <line x1="0" y1="160" x2="360" y2="160" stroke="#38bdf8" strokeDasharray="3,3" strokeWidth="0.5" opacity="0.6" />
          <text x="180" y="174" fill="#7dd3fc" fontSize="4.2" fontWeight="bold" textAnchor="middle">
            South Pole Polar Target Band (&lt; -70°: Grazing Sun &amp; Earth Libration)
          </text>
          <text x="180" y="8" fill="#64748b" fontSize="4" textAnchor="middle">North Pole</text>
        </svg>

        {/* Site markers */}
        {mappableSites.map((site) => {
          const isA = site.id === scenarioAId
          const isB = site.id === scenarioBId
          const isBoth = isA && isB
          const x = toX(site.lon!)
          const y = toY(site.lat!)

          let markerColor = 'bg-space-300 ring-1 ring-space-400'
          if (isBoth) {
            markerColor = 'bg-gradient-to-r from-sun-500 to-earth-500 ring-4 ring-sun-500/40 animate-pulse'
          } else if (isA) {
            markerColor = 'bg-sun-500 ring-4 ring-sun-500/50 scale-125'
          } else if (isB) {
            markerColor = 'bg-earth-500 ring-4 ring-earth-500/50 scale-125'
          }

          return (
            <div
              key={site.id}
              style={{ left: `${x}%`, top: `${y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition-transform duration-150 hover:scale-150"
              onClick={() => setSelectedPin(site)}
              onMouseEnter={() => setHoveredSite(site)}
              onMouseLeave={() => setHoveredSite(null)}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full ${markerColor} shadow-md flex items-center justify-center`}
                title={`${site.name} (${site.lat}°, ${site.lon}°)`}
              >
                {site.coord_kind === 'actual' ? (
                  <div className="w-1 h-1 bg-white rounded-full"></div>
                ) : (
                  <div className="w-1 h-1 border border-white rounded-full"></div>
                )}
              </div>
            </div>
          )
        })}

        {/* Coords overlay corner */}
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-space-900/90 border border-space-700/80 rounded text-3xs text-space-400 font-mono">
          Planetocentric Lat [-90, +90] | East-Positive Lon [-180, +180]
        </div>
      </div>

      {/* Pin Details & Quick Actions */}
      {activePin ? (
        <div className="p-3 bg-space-900 border border-space-700 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in text-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-space-100">{activePin.name}</span>
              {activePin.isMission ? (
                <span className="px-1.5 py-0.5 rounded text-3xs font-medium bg-space-700 text-space-300">
                  Mission
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-3xs font-medium bg-space-700 text-space-300">
                  Reference Site
                </span>
              )}
              {activePin.coord_kind === 'actual' ? (
                <span className="px-1.5 py-0.5 rounded text-3xs bg-emerald-950 border border-emerald-800 text-emerald-300">
                  Actual Touchdown
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-3xs bg-amber-950 border border-amber-800 text-amber-300">
                  Planned Center
                </span>
              )}
            </div>
            <div className="text-space-400 font-mono text-2xs mt-0.5">
              Lat: {activePin.lat}° · Lon: {activePin.lon}° · {activePin.provider ? `${activePin.provider} (${activePin.lander})` : 'Terrain Datum'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScenarioA(activePin.id)}
              className="px-2.5 py-1 rounded bg-sun-500/20 hover:bg-sun-500/30 text-sun-300 border border-sun-500/40 font-medium transition-colors"
            >
              Set as A
            </button>
            <button
              onClick={() => setScenarioB(activePin.id)}
              className="px-2.5 py-1 rounded bg-earth-500/20 hover:bg-earth-500/30 text-earth-300 border border-earth-500/40 font-medium transition-colors"
            >
              Set as B
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2.5 text-center text-3xs text-space-400">
          Click or hover on a landing site marker to inspect coordinates or assign to Scenario A or B.
        </div>
      )}
    </div>
  )
}
