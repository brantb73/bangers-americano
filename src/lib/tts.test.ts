import { describe, expect, it } from 'vitest'
import { prepareTtsText, TTS_MAX_CHARS } from './tts'

describe('prepareTtsText', () => {
  it('returns empty for blank input', () => {
    expect(prepareTtsText('   ')).toEqual({ text: '', truncated: false })
  })

  it('passes through short scripts', () => {
    const s = 'Welcome back to the Bangers Highlight Reel.'
    expect(prepareTtsText(s)).toEqual({ text: s, truncated: false })
  })

  it('truncates long scripts with a note', () => {
    const huge = 'x'.repeat(TTS_MAX_CHARS + 200)
    const { text, truncated } = prepareTtsText(huge)
    expect(truncated).toBe(true)
    expect(text.length).toBeLessThanOrEqual(TTS_MAX_CHARS)
    expect(text).toContain('[Recap truncated for audio length.]')
  })
})
