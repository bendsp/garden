type BrowserWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext
}

type Tone = {
  frequency: number
  startOffset: number
  duration: number
  gain: number
}

const SAMPLE_RATE = 22_050
const sounds = new Map<string, string>()
let context: AudioContext | null = null

function getAudioContext() {
  if (typeof window === 'undefined') {
    return null
  }

  const AudioContextClass = window.AudioContext ?? (window as BrowserWindow).webkitAudioContext
  if (!AudioContextClass) {
    return null
  }

  try {
    context ??= new AudioContextClass()
  } catch {
    return null
  }

  if (context.state === 'suspended') {
    void context.resume()
  }

  return context
}

function playWebAudioTone({ frequency, startOffset, duration, gain: peakGain }: Tone) {
  const audio = getAudioContext()
  if (!audio) {
    return false
  }

  try {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    const start = audio.currentTime + startOffset
    const end = start + duration

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, start)

    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    oscillator.connect(gain)
    gain.connect(audio.destination)
    oscillator.start(start)
    oscillator.stop(end + 0.02)
    return true
  } catch {
    return false
  }
}

function envelope(time: number, duration: number) {
  const attack = Math.min(0.012, duration * 0.4)
  if (time < attack) {
    return time / attack
  }

  return Math.max(0, 1 - (time - attack) / (duration - attack))
}

function encodeWav(tones: Tone[]) {
  const totalDuration = Math.max(...tones.map((tone) => tone.startOffset + tone.duration)) + 0.03
  const sampleCount = Math.ceil(totalDuration * SAMPLE_RATE)
  const bytes = new Uint8Array(44 + sampleCount * 2)
  const view = new DataView(bytes.buffer)

  function writeString(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, sampleCount * 2, true)

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const time = sample / SAMPLE_RATE
    const value = tones.reduce((sum, tone) => {
      const localTime = time - tone.startOffset
      if (localTime < 0 || localTime > tone.duration) {
        return sum
      }

      return sum + Math.sin(Math.PI * 2 * tone.frequency * localTime) * tone.gain * envelope(localTime, tone.duration)
    }, 0)
    view.setInt16(44 + sample * 2, Math.max(-1, Math.min(1, value)) * 0x7fff, true)
  }

  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 4096) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 4096))
  }

  return `data:audio/wav;base64,${btoa(binary)}`
}

function playFallbackSound(key: string, tones: Tone[]) {
  if (typeof Audio === 'undefined' || typeof btoa === 'undefined') {
    return
  }

  if (!sounds.has(key)) {
    sounds.set(key, encodeWav(tones))
  }

  const source = sounds.get(key)
  if (!source) {
    return
  }

  try {
    const audio = new Audio(source)
    audio.volume = 1
    void audio.play().catch(() => {})
  } catch {
    // Sound is optional; unsupported audio should never block a move.
  }
}

function playSound(key: string, tones: Tone[]) {
  if (!tones.every(playWebAudioTone)) {
    playFallbackSound(key, tones)
  }
}

export function playSelectSound() {
  playSound('select', [{ frequency: 420, startOffset: 0, duration: 0.055, gain: 0.04 }])
}

export function playMatchSound() {
  playSound('match', [
    { frequency: 620, startOffset: 0, duration: 0.07, gain: 0.045 },
    { frequency: 820, startOffset: 0.045, duration: 0.08, gain: 0.035 },
  ])
}

export function playWinSound() {
  playSound('win', [
    { frequency: 660, startOffset: 0, duration: 0.08, gain: 0.045 },
    { frequency: 780, startOffset: 0.09, duration: 0.08, gain: 0.045 },
    { frequency: 980, startOffset: 0.18, duration: 0.14, gain: 0.04 },
  ])
}

export function playLossSound() {
  playSound('loss', [
    { frequency: 520, startOffset: 0, duration: 0.09, gain: 0.045 },
    { frequency: 410, startOffset: 0.085, duration: 0.1, gain: 0.042 },
    { frequency: 310, startOffset: 0.18, duration: 0.16, gain: 0.038 },
  ])
}
