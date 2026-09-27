import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isIosApp } from './platform'
import { downloadJson } from './transfer'
import { shareText, type ShareTextResult } from './share'

export type NativeShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed'

export function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

export function isShareCancel(err: unknown): boolean {
  return /cancel/i.test(errorText(err))
}

/** Recap script: iOS share sheet, otherwise the existing Web Share / clipboard path. */
export async function shareRecapText(title: string, text: string): Promise<ShareTextResult> {
  if (!isIosApp()) return shareText(title, text)
  const trimmed = text.trim()
  if (!trimmed) return 'failed'
  try {
    await Share.share({
      title,
      text: trimmed,
      dialogTitle: 'Share recap',
    })
    return 'shared'
  } catch (err) {
    return isShareCancel(err) ? 'cancelled' : 'failed'
  }
}

/**
 * Export JSON: iOS writes a file and opens the share sheet.
 * The website keeps the browser download.
 */
export async function shareJsonExport(
  filename: string,
  json: string,
): Promise<NativeShareResult> {
  if (!isIosApp()) {
    downloadJson(filename, json)
    return 'downloaded'
  }
  const safe = filename.replace(/[^\w.-]+/g, '_')
  try {
    const written = await Filesystem.writeFile({
      path: safe,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    await Share.share({
      title: 'Tournify export',
      files: [written.uri],
      dialogTitle: 'Share export',
    })
    return 'shared'
  } catch (err) {
    return isShareCancel(err) ? 'cancelled' : 'failed'
  }
}
