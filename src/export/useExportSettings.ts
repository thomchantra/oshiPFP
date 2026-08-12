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
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>('original')
  const [customSize, setCustomSize] = useState({ width: cropSize?.width ?? 512, height: cropSize?.height ?? 512 })
  const [resampleMode, setResampleMode] = useState<ResampleMode>('lanczos3')
  const [format, setFormat] = useState<ExportFormat>('png')

  return {
    exportDisplayMode, setExportDisplayMode,
    exportColorGrade, setExportColorGrade,
    resolutionMode, setResolutionMode,
    customSize, setCustomSize,
    resampleMode, setResampleMode,
    format, setFormat,
  }
}
