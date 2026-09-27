import { describe, expect, it } from 'vitest'
import { isIosApp, recapSurface } from './platform'

describe('recapSurface', () => {
  it('keeps the website on Web Speech and /api/tts', () => {
    expect(isIosApp()).toBe(false)
    expect(recapSurface(false)).toBe('web')
  })

  it('uses on-device audio in the iPhone app', () => {
    expect(recapSurface(true)).toBe('ios')
  })
})
