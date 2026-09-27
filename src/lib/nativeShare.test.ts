import { describe, expect, it } from 'vitest'
import { errorText, isShareCancel } from './nativeShare'

describe('share cancel detection', () => {
  it('treats the iOS share sheet dismiss as a cancel', () => {
    expect(isShareCancel(new Error('Share canceled'))).toBe(true)
    expect(isShareCancel({ message: 'Share cancelled' })).toBe(true)
    expect(errorText({ message: 'Must provide at least url, text or files' })).toBe(
      'Must provide at least url, text or files',
    )
    expect(isShareCancel(new Error('Could not write file'))).toBe(false)
  })
})
