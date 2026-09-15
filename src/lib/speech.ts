/** Web Speech API helpers for podcast / highlight-reel narration. */

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Prefer a calm, conversational English voice (podcast host, not auctioneer). */
function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null

  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang))
  const pool = en.length > 0 ? en : voices

  const prefer = pool.find((v) =>
    /samantha|karen|moira|daniel|alex|fred|victoria|google us english|microsoft (aria|jenny|guy)|natural/i.test(
      v.name,
    ),
  )
  // Avoid overly theatrical / novelty voices when possible
  const calm = prefer ?? pool.find((v) => !/zarvox|bad news|whisper|horror|novelty/i.test(v.name))
  return calm ?? pool[0] ?? null
}

export function speakRecap(
  text: string,
  opts?: { onEnd?: () => void; onError?: () => void },
): SpeechSynthesisUtterance | null {
  if (!speechSupported()) return null
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  const voice = pickVoice()
  if (voice) utter.voice = voice
  // Podcast pace — conversational, not rushed highlight-TV
  utter.rate = 0.98
  utter.pitch = 1.0
  utter.volume = 1
  if (opts?.onEnd) utter.onend = opts.onEnd
  if (opts?.onError) utter.onerror = opts.onError
  window.speechSynthesis.speak(utter)
  return utter
}

export function pauseRecap(): void {
  if (!speechSupported()) return
  window.speechSynthesis.pause()
}

export function resumeRecap(): void {
  if (!speechSupported()) return
  window.speechSynthesis.resume()
}

export function stopRecap(): void {
  if (!speechSupported()) return
  window.speechSynthesis.cancel()
}

export function isSpeaking(): boolean {
  return speechSupported() && window.speechSynthesis.speaking
}

export function isPaused(): boolean {
  return speechSupported() && window.speechSynthesis.paused
}
