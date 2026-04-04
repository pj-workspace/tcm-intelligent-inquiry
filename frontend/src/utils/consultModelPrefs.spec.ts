import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CONSULT_MODEL_PREFS,
  normalizeConsultModelPrefs,
} from './consultModelPrefs'

describe('normalizeConsultModelPrefs', () => {
  it('uses defaults for non-object', () => {
    expect(normalizeConsultModelPrefs(null)).toEqual(DEFAULT_CONSULT_MODEL_PREFS)
    expect(normalizeConsultModelPrefs('x')).toEqual(DEFAULT_CONSULT_MODEL_PREFS)
  })

  it('clamps temperature and topP', () => {
    expect(
      normalizeConsultModelPrefs({ temperature: 99, topP: 0.01 })
    ).toMatchObject({ temperature: 2, topP: 0.05 })
  })

  it('clamps integer-like fields', () => {
    expect(
      normalizeConsultModelPrefs({
        maxHistoryTurns: 0,
        ragTopK: 100,
        literatureTopK: -1,
      })
    ).toMatchObject({ maxHistoryTurns: 1, ragTopK: 20, literatureTopK: 1 })
  })
})
