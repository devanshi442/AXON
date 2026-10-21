/**
 * MethodsPage — Phase 0 stub.
 * Full implementation in Phase 3 (with validation table, kernel info, etc.)
 */
import { SCIENCE_CONVENTIONS } from '../constants/scienceConventions'

export default function MethodsPage() {
  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-semibold text-space-100 mb-2">Methods & Conventions</h1>
      <p className="text-space-400 text-sm mb-8">
        All science conventions used in this application. These values are the single source of
        truth for every computation.{' '}
        <span className="text-space-500">Full validation table added in Phase 3.</span>
      </p>

      <div className="bg-space-800 border border-space-600 rounded-2xl overflow-hidden">
        <table className="w-full text-sm" role="table" aria-label="Science conventions">
          <thead>
            <tr className="border-b border-space-600">
              <th scope="col" className="px-5 py-3 text-left text-space-400 font-medium">Convention</th>
              <th scope="col" className="px-5 py-3 text-left text-space-400 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {SCIENCE_CONVENTIONS.map(({ label, value }, i) => (
              <tr key={label} className={i % 2 === 0 ? 'bg-space-800' : 'bg-space-900/50'}>
                <td className="px-5 py-3 text-space-300 font-medium">{label}</td>
                <td className="px-5 py-3 text-space-200 font-mono text-xs">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-space-800 rounded-xl border border-space-600 text-sm text-space-400">
        <strong className="text-space-200">Limitations (summary):</strong>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>Earth visibility is geometric only — not a communication link budget</li>
          <li>Sun above the idealized horizon is not proof of solar panel illumination</li>
          <li>Phase 0–3 uses a flat (idealized) horizon — especially misleading at the south pole</li>
          <li>Some mission coordinates are estimated or unverified — check the verified badge</li>
          <li>Do not use this tool for flight planning or mission-critical decisions</li>
        </ul>
      </div>
    </div>
  )
}
