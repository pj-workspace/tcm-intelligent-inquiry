import { describe, expect, it } from 'vitest'

import {
  ApiBusinessError,
  formatStreamHttpError,
  getErrorMessage,
  MSG_SERVER,
} from './errors'

describe('api errors', () => {
  it('formatStreamHttpError hides body for 5xx', () => {
    expect(formatStreamHttpError(502, 'Bad Gateway', 'internal detail')).toBe(
      MSG_SERVER
    )
  })

  it('getErrorMessage handles ApiBusinessError', () => {
    expect(getErrorMessage(new ApiBusinessError('hello', 3))).toBe('hello')
  })
})
