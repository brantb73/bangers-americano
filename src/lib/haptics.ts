import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { isIosApp } from './platform'

/** Light tap on the iPhone. No-op on the website. */
export function hapticLight(): void {
  if (!isIosApp()) return
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)
}
