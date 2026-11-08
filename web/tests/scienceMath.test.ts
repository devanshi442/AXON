import test from 'node:test'
import assert from 'node:assert/strict'
import golden from './golden_vectors.json' with { type: 'json' }
import {
  lookupHorizonElevation,
  computeSolarFraction,
  computeEarthVisibility,
  computeSolarPowerWatts,
  extractIntervals,
  computeOpportunityMetrics,
} from '../src/utils/scienceMath'

test('lookupHorizonElevation matches Python golden vectors exactly', () => {
  const mask = golden.mask_sample
  for (let i = 0; i < golden.test_azimuths.length; i++) {
    const az = golden.test_azimuths[i]
    const expected = golden.horizon_lookups[i]
    const actual = lookupHorizonElevation(mask, az)
    assert.ok(
      Math.abs(actual - expected) < 1e-3,
      `Mismatch at az ${az}: expected ${expected}, got ${actual}`
    )
  }
})

test('computeSolarFraction matches Python golden vectors exactly', () => {
  const mask = golden.mask_sample
  for (let i = 0; i < golden.test_sun_cases.length; i++) {
    const c = golden.test_sun_cases[i]
    const expected = golden.solar_fractions[i]
    const actual = computeSolarFraction(c.az, c.el, mask)
    assert.ok(
      Math.abs(actual - expected) < 1e-3,
      `Mismatch for case ${JSON.stringify(c)}: expected ${expected}, got ${actual}`
    )
  }
})

test('computeSolarPowerWatts matches Python golden vectors exactly', () => {
  for (let i = 0; i < golden.test_sun_cases.length; i++) {
    const c = golden.test_sun_cases[i]
    const f = golden.solar_fractions[i]

    const flatActual = computeSolarPowerWatts(c.el, c.az, f, 'flat')
    assert.ok(
      Math.abs(flatActual - golden.power_watts_flat[i]) < 0.1,
      `Flat power mismatch for ${i}: expected ${golden.power_watts_flat[i]}, got ${flatActual}`
    )

    const vertActual = computeSolarPowerWatts(c.el, c.az, f, 'vertical')
    assert.ok(
      Math.abs(vertActual - golden.power_watts_vert[i]) < 0.1,
      `Vert power mismatch for ${i}: expected ${golden.power_watts_vert[i]}, got ${vertActual}`
    )

    const trackActual = computeSolarPowerWatts(c.el, c.az, f, 'tracking')
    assert.ok(
      Math.abs(trackActual - golden.power_watts_track[i]) < 0.1,
      `Tracking power mismatch for ${i}: expected ${golden.power_watts_track[i]}, got ${trackActual}`
    )
  }
})

test('computeEarthVisibility handles clearance margins and criteria', () => {
  const mask = [0.0, 5.0, 10.0, 0.0]
  // At az = 90 (idx 1, mask = 5.0 deg)
  // Center: el >= 5.0
  assert.equal(computeEarthVisibility(90, 4.9, mask), false)
  assert.equal(computeEarthVisibility(90, 5.0, mask), true)

  // With margin 2.0: required 7.0
  assert.equal(computeEarthVisibility(90, 6.9, mask, 2.0), false)
  assert.equal(computeEarthVisibility(90, 7.0, mask, 2.0), true)

  // full_disk criterion: (el - 0.95) >= 5.0 -> el >= 5.95
  assert.equal(computeEarthVisibility(90, 5.9, mask, 0.0, 'full_disk'), false)
  assert.equal(computeEarthVisibility(90, 6.0, mask, 0.0, 'full_disk'), true)
})

test('extractIntervals and computeOpportunityMetrics work accurately', () => {
  const times = ['2026-03-01T00:00:00Z', '2026-03-01T01:00:00Z', '2026-03-01T02:00:00Z', '2026-03-01T03:00:00Z']
  const active = [true, true, false, true]
  const intervals = extractIntervals(times, active, 3600)
  assert.equal(intervals.length, 2)
  assert.equal(intervals[0].durationHours, 2)
  assert.equal(intervals[1].durationHours, 1)

  const summary = computeOpportunityMetrics(times, active, 3600)
  assert.equal(summary.totalHours, 3)
  assert.equal(summary.percentage, 75)
  assert.equal(summary.longestWindowHours, 2)
  assert.equal(summary.longestDarkGapHours, 1)
})

