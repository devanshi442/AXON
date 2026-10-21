/**
 * ExplorerPage — Phase 0 stub.
 * Full implementation in Phase 1.
 */
export default function ExplorerPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-6 animate-fade-in">
      {/* Moon icon */}
      <div className="w-24 h-24 rounded-full bg-space-800 border border-space-600 flex items-center justify-center shadow-card">
        <svg viewBox="0 0 24 24" className="w-12 h-12 text-space-300" fill="none" stroke="currentColor" strokeWidth={1}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" strokeLinecap="round" />
        </svg>
      </div>

      <div>
        <h1 className="text-3xl font-semibold text-space-100 mb-2">
          AXON LunarSight
        </h1>
        <p className="text-space-300 text-lg max-w-md">
          CLPS Lunar Mission Browser
        </p>
        <p className="text-space-400 text-sm mt-1">
          Phase 0 foundations ✓ — Explorer builds in Phase 1
        </p>
      </div>

      <div className="flex gap-4 text-sm">
        <div className="px-4 py-2 bg-space-800 rounded-xl border border-space-600 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sun-500"></span>
          <span className="text-sun-400">Sun — amber</span>
        </div>
        <div className="px-4 py-2 bg-space-800 rounded-xl border border-space-600 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-earth-500"></span>
          <span className="text-earth-400">Earth — cyan</span>
        </div>
      </div>

      <p className="text-2xs text-space-500 max-w-sm">
        Geometry is geometric only — not a link budget or mission recommendation.
        Flat-horizon results are labelled "idealized, not terrain-aware".
      </p>
    </div>
  )
}
