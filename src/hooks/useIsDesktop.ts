import { useEffect, useState } from 'react'

const DESKTOP_QUERY = '(min-width: 900px)'

/** Matches base.css's desktop breakpoint (min-width: 900px) — for gating JS behavior, not
 * just CSS display, on the same breakpoint (e.g. BottomSheet's drag-vs-static layout,
 * App.tsx's Dual Pane toggle). */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setIsDesktop(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}
