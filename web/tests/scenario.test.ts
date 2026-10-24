import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getElevationAtTime,
  compute30DayWindows,
  SUN_UPPER_LIMB_DEG,
} from '../src/stores/scenarioStore'
import type { GeometryTimeseries } from '../src/types/mission'

const mockTs: GeometryTimeseries = {
  start_utc: '2026-03-01T00:00:00Z',
  stop_utc: '2026-03-05T00:00:00Z',
  step_seconds: 3600,
  times: [
    '2026-03-01T00:00:00Z',
    '2026-03-01T01:00:00Z',
    '2026-03-01T02:00:00Z',
    '2026-03-01T03:00:00Z',
  ],
  sun_azimuth_deg: [90.0, 91.0, 92.0, 93.0],
  sun_elevation_deg: [-0.1, 4.8, 10.0, 15.0],
  earth_azimuth_deg: [10.0, 10.1, 10.2, 10.3],
  earth_elevation_deg: [12.0, 12.1, 12.2, 12.3],
  frame: 'MOON_ME',
  abcorr: 'LT+S',
  horizon_mode: 'idealized',
}

test('getElevationAtTime returns matching hourly sample', () => {
  const res = getElevationAtTime(mockTs, '2026-03-01T01:00:00Z')
  assert.equal(res.isOutRange, false)
  assert.equal(res.sunElevation, 4.8)
  assert.equal(res.earthElevation, 12.1)
  assert.equal(res.sunAzimuth, 91.0)
})

test('getElevationAtTime flags out-of-range times', () => {
  const resBefore = getElevationAtTime(mockTs, '2025-01-01T00:00:00Z')
  assert.equal(resBefore.isOutRange, true)
  assert.equal(resBefore.sunElevation, null)

  const resAfter = getElevationAtTime(mockTs, '2027-01-01T00:00:00Z')
  assert.equal(resAfter.isOutRange, true)
})

test('compute30DayWindows applies upper-limb correction and threshold', () => {
  assert.equal(SUN_UPPER_LIMB_DEG, 0.267)
  // Threshold 5.0 deg
  // Sun elevations: [-0.1, 4.8, 10.0, 15.0]
  // With upper limb (+0.267): [-0.1+0.267=0.167 < 5, 4.8+0.267=5.067 >= 5, 10.267 >= 5, 15.267 >= 5]
  // So indices 1, 2, 3 meet threshold (3 hours)
  const opp = compute30DayWindows(mockTs, '2026-03-01T00:00:00Z', 5.0)
  assert.notEqual(opp, null)
  assert.equal(opp?.sun.windows.length, 1)
  assert.equal(opp?.sun.windows[0].start, '2026-03-01T01:00:00Z')
  assert.equal(opp?.sun.windows[0].end, '2026-03-01T03:00:00Z')
  assert.equal(opp?.sun.windows[0].duration_hours, 3.0)

  // Earth elevations are all > 5.0 deg (indices 0, 1, 2, 3 -> 4 hours)
  assert.equal(opp?.earth.total_hours, 4.0)

  // Joint window is intersection: indices 1, 2, 3 (3 hours)
  assert.equal(opp?.joint.windows.length, 1)
  assert.equal(opp?.joint.total_hours, 3.0)
})

test('comparison arithmetic B - A is exact', () => {
  const elA = 10.0
  const elB = 14.5
  const diff = elB - elA
  assert.equal(diff, 4.5)
})
