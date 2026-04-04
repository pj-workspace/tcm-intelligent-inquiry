import { describe, expect, it } from 'vitest'

import {
  computeTargetSize,
  encodeImageFileToHerbPayload,
  parseDataUrlPayload,
} from './herbImagePayload'

describe('parseDataUrlPayload', () => {
  it('parses standard data url', () => {
    const p = parseDataUrlPayload('data:image/png;base64,QUJD')
    expect(p).toEqual({ mime: 'image/png', base64: 'QUJD' })
  })

  it('returns null for invalid', () => {
    expect(parseDataUrlPayload('not-a-data-url')).toBeNull()
  })
})

describe('computeTargetSize', () => {
  it('returns original when within max edge', () => {
    expect(computeTargetSize(800, 600, 1280)).toEqual({ width: 800, height: 600 })
  })

  it('scales down proportionally', () => {
    expect(computeTargetSize(4000, 2000, 1280)).toEqual({ width: 1280, height: 640 })
    expect(computeTargetSize(100, 3000, 1280)).toEqual({ width: 43, height: 1280 })
  })
})

describe('encodeImageFileToHerbPayload', () => {
  it('encodes a small png file', async () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ])
    const file = new File([png], 't.png', { type: 'image/png' })
    const out = await encodeImageFileToHerbPayload(file)
    expect(out.herbImageMimeType).toBe('image/png')
    expect(out.herbImageBase64.length).toBeGreaterThan(10)
  })
})
