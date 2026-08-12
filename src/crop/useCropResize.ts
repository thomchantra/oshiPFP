import { useEffect, useState } from 'react'
import type { ResizeMode, ResizeParams } from '../types'

export const IDENTITY_RESIZE: ResizeParams = { mode: 'original', customSize: { width: 512, height: 512 } }

/**
 * Crop tab's Resize module state, lifted out of CropPanel (which App.tsx
 * only mounts while tab === 'crop') so a chosen custom size survives
 * switching to another tab and back — same unmount-wipes-local-state
 * pattern useCropEnhance/useExportSettings already fix for
 * Enhancement/Export. Unlike useExportSettings (whose state is read
 * directly by ExportPanel, no pipeline side effect), Resize actually
 * changes the working pipeline resolution, so this hook pushes changes into
 * the pipeline via onResizeChange — same shape as useCropEnhance's
 * onEnhanceChange.
 *
 * cropSize seeds the initial custom-size default the same way
 * useExportSettings(cropSize) does. Note cropSize here is
 * Pipeline.cropSize, which (after this workstream) reflects the *resized*
 * output, not the raw crop — but while resizeMode is 'original' the resize
 * stage is aliased straight to cropTarget (see pipeline.ts), so cropSize
 * still equals the raw crop's native size in that state, which is exactly
 * when this default/prefill logic runs.
 */
export function useCropResize(
  cropSize: { width: number; height: number } | null,
  onResizeChange: (params: ResizeParams) => void,
) {
  const [mode, setModeRaw] = useState<ResizeMode>('original')
  const [customSize, setCustomSize] = useState({ width: cropSize?.width ?? 512, height: cropSize?.height ?? 512 })
  // Aspect ratio Custom mode was entered with — held fixed while editing
  // width/height so the two fields can propagate to each other (see
  // CropPanel's commitWidth/commitHeight) without drifting on repeated edits.
  const [customRatio, setCustomRatio] = useState(1)

  // Prefill the custom fields with whatever 'original' was already
  // resolving to, so switching to Custom doesn't jolt to an unrelated
  // stale value — mirrors ExportPanel's selectResolution.
  const setMode = (next: ResizeMode) => {
    if (next === 'custom' && mode !== 'custom' && cropSize) {
      setCustomSize(cropSize)
      setCustomRatio(cropSize.width / cropSize.height)
    }
    setModeRaw(next)
  }

  useEffect(() => {
    onResizeChange({ mode, customSize })
    // onResizeChange identity is stable from usePipeline; only re-run when mode/customSize changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, customSize])

  return { mode, setMode, customSize, setCustomSize, customRatio }
}
