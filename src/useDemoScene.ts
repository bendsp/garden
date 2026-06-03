import { useEffect, useMemo, useState } from 'react'
import { type DemoScene, getDemoStateAt } from './demoScene'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useDemoScene(scene: DemoScene) {
  const [timeMs, setTimeMs] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)

    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      return undefined
    }

    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      setTimeMs(now - startedAt)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [reducedMotion, scene])

  const renderTimeMs = reducedMotion ? 0 : timeMs

  return useMemo(() => getDemoStateAt(scene, renderTimeMs), [scene, renderTimeMs])
}
