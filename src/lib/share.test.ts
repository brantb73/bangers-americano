import { afterEach, describe, expect, it, vi } from 'vitest'
import { canNativeShare, downloadTextFile, shareText } from './share'

describe('shareText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reports native share availability from navigator.share', () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined })
    expect(canNativeShare()).toBe(false)
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn() })
    expect(canNativeShare()).toBe(true)
  })

  it('falls back to clipboard when share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      share: undefined,
      clipboard: { writeText },
    })

    const result = await shareText('Bangers Highlight Reel', 'Hello from the courts')
    expect(result).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('Hello from the courts')
  })

  it('downloadTextFile creates a plain-text blob download', () => {
    const click = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:test')
    const revoke = vi.fn()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL: revoke,
    })
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click } as unknown as HTMLAnchorElement
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag)
    })

    downloadTextFile('recap.txt', 'snarky script')
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:test')
  })
})
