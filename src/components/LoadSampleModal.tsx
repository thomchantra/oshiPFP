import { useState } from 'react'
import Modal from './Modal'
import { PRESET_MANIFEST } from '../presets/presetManifest'

interface LoadSampleModalProps {
  open: boolean
  onClose: () => void
  onLoadFile: (file: File) => void
}

/** Simplified mode's "Load Sample Image" — replaces Advanced mode's algorithm-gallery button (see
 * HeaderBar.tsx/BlankState.tsx), since the demo-preset gallery concept (per-algo before/after
 * cards, "Load Demo" applying tuning) doesn't apply in Simplified mode. This is a plain photo
 * picker over the same before.webp set the presets/filters were built from (PRESET_MANIFEST,
 * src/presets/data/) — every entry has its own distinct sample photo (35 total, 5 per algo), so no
 * dedup needed. Tapping one only loads the photo itself, no tuning/preset params — the user picks
 * filters afterward like any other photo, matching "sample photo for someone with no photo of
 * their own to try filters on," not "load a pre-baked look." */
export default function LoadSampleModal({ open, onClose, onLoadFile }: LoadSampleModalProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handlePick = async (id: string, beforeImage: string) => {
    if (loadingId) return
    setLoadingId(id)
    try {
      const response = await fetch(beforeImage)
      const blob = await response.blob()
      const file = new File([blob], `${id}-sample.webp`, { type: blob.type || 'image/webp' })
      onLoadFile(file)
      onClose()
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Load Sample Image">
      <div className="load-sample-grid">
        {PRESET_MANIFEST.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="load-sample-cell"
            disabled={!!loadingId}
            aria-label={`Load ${preset.algoLabel} sample photo`}
            onClick={() => void handlePick(preset.id, preset.beforeImage)}
          >
            <img src={preset.beforeImage} alt={`${preset.algoLabel} sample`} />
          </button>
        ))}
      </div>
    </Modal>
  )
}
