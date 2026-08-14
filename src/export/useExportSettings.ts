import { useState } from 'react'
import type { ExportDisplayMode, ExportFormat, ResampleMode, ResolutionMode } from '../types'

/**
 * Export tab's settings, lifted out of ExportPanel.tsx into a hook App.tsx
 * instantiates once — same reason useColorCurve/useColorAdjustments exist:
 * ExportPanel only renders while `tab === 'export'`, so state owned inside
 * it got wiped every time the tab was tucked away. Caught via real-device
 * testing: "when I tuck the export tab away, all the export settings are
 * wiped to default."
 */
export function useExportSettings(cropSize: { width: number; height: number } | null) {
  const [exportDisplayMode, setExportDisplayMode] = useState<ExportDisplayMode>('composite')
  // Independent of exportDisplayMode — whether Grade tab's adjustments are included in the
  // export/preview at all. Defaults true to match today's actual behavior (Composite/Overlay
  // already included grading unconditionally before this toggle existed).
  const [exportColorGrade, setExportColorGrade] = useState(true)
  // "Grade Intensity" slider (v0.3 post-Hinata close-out) — 0..1, blends ungraded/graded via
  // pipeline.ts's blendGradeIntensity. Defaults to 1 (fully graded) so it's a no-op alongside
  // exportColorGrade's own existing default, matching today's behavior exactly until touched.
  const [exportColorGradeIntensity, setExportColorGradeIntensity] = useState(1)
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>('original')
  const [customSize, setCustomSize] = useState({ width: cropSize?.width ?? 512, height: cropSize?.height ?? 512 })
  // Aspect ratio Custom mode was entered with — held fixed while editing width/height so the two
  // fields can propagate to each other (see ExportPanel's commitWidth/commitHeight) without
  // drifting on repeated edits. Same shape as useCropResize.ts's own customRatio.
  const [exportCustomRatio, setExportCustomRatio] = useState(1)
  const [resampleMode, setResampleMode] = useState<ResampleMode>('lanczos3')
  const [format, setFormat] = useState<ExportFormat>('png')

  // "Reset oshiPFP" (v0.3 polish pass) — back to this hook's own initial-useState defaults.
  const reset = () => {
    setExportDisplayMode('composite')
    setExportColorGrade(true)
    setExportColorGradeIntensity(1)
    setResolutionMode('original')
    setCustomSize({ width: cropSize?.width ?? 512, height: cropSize?.height ?? 512 })
    setExportCustomRatio(1)
    setResampleMode('lanczos3')
    setFormat('png')
  }

  return {
    exportDisplayMode, setExportDisplayMode,
    exportColorGrade, setExportColorGrade,
    exportColorGradeIntensity, setExportColorGradeIntensity,
    resolutionMode, setResolutionMode,
    customSize, setCustomSize,
    exportCustomRatio, setExportCustomRatio,
    resampleMode, setResampleMode,
    format, setFormat,
    reset,
  }
}
