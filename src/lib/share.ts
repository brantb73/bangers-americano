/** Share recap as text (Web Share API + clipboard / file download fallbacks). */

export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export type ShareTextResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Prefer navigator.share; on failure/unavailable, copy to clipboard.
 * Does not attempt to export speech audio.
 */
export async function shareText(
  title: string,
  text: string,
): Promise<ShareTextResult> {
  const trimmed = text.trim()
  if (!trimmed) return 'failed'

  if (canNativeShare()) {
    try {
      await navigator.share({ title, text: trimmed })
      return 'shared'
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'AbortError') return 'cancelled'
      // fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(trimmed)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
