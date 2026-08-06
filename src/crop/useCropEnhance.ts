import { useEffect, useState } from 'react'
import type { EnhanceParams } from '../types'

export const IDENTITY_ENHANCE: EnhanceParams = { smooth: 0, sharpen: 0 }

/**
 * Lifted out of CropPanel (which App.tsx only mounts while tab === 'crop')
 * so a tweaked Smooth/Sharpen value survives switching to another tab and
 * back — same unmount-wipes-local-state pattern fixed for Color/Export.
 */
export function useCropEnhance(onEnhanceChange: (params: EnhanceParams) => void) {
  const [enhance, setEnhance] = useState<EnhanceParams>(IDENTITY_ENHANCE)

  useEffect(() => {
    onEnhanceChange(enhance)
    // onEnhanceChange identity is stable from usePipeline; only re-run when enhance changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enhance])

  return { enhance, setEnhance }
}
