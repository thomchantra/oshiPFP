import { useEffect, useState } from 'react'
import IconButton from './IconButton'
import Modal from './Modal'
import Icon from './Icon'
import { PRESET_MANIFEST } from '../presets/presetManifest'
import type { LineArtMode } from '../types'

export const ALGO_OPTIONS: { mode: LineArtMode; label: string; icon: 'rose' | 'spark' | 'diamond' | 'spiral' | 'bear' | 'sun' | 'moon' }[] = [
  { mode: 'pathB', label: 'Botan', icon: 'rose' },
  { mode: 'pathC', label: 'Chie', icon: 'spark' },
  { mode: 'pathD', label: 'Daiya', icon: 'diamond' },
  { mode: 'pathF', label: 'Fumiko', icon: 'spiral' },
  { mode: 'pathG', label: 'Gumi', icon: 'bear' },
  { mode: 'pathH', label: 'Hinata', icon: 'sun' },
  { mode: 'pathI', label: 'Tsukiko', icon: 'moon' },
]

const ALGO_INFO: { mode: LineArtMode; label: string; technique: string; icon: 'rose' | 'spark' | 'diamond' | 'spiral' | 'bear' | 'sun' | 'moon'; blurb: string }[] = [
  {
    mode: 'pathB',
    label: 'Botan',
    technique: 'Distance Transform',
    icon: 'rose',
    blurb:
      "Grows line art evenly outward in every direction, inflating it — the further from a line, the less it's affected. Gives smooth, rounded, chunky outlines.",
  },
  {
    mode: 'pathC',
    label: 'Chie',
    technique: 'Erosion + Soft Gate',
    icon: 'spark',
    blurb:
      "Softly blends color inward from the edges of line art, reads more gently with a gradual transition instead of a crisp added border.",
  },
  {
    mode: 'pathD',
    label: 'Daiya',
    technique: 'Distance Transform + Octagon Mode',
    icon: 'diamond',
    blurb:
      "Grows lines using the same true distance-transform math as Botan, smooth and round by default. Switch to Octagon mode for a faceted, chisel marker look",
  },
  {
    mode: 'pathF',
    label: 'Fumiko',
    technique: 'Find Edge + Dilate',
    icon: 'spiral',
    blurb:
      "Detects edges directly instead of thickening existing lines. Produces crisp, naturally colorful edge-lines with real graduated transparency along each line.",
  },
  {
    mode: 'pathG',
    label: 'Gumi',
    technique: 'Contrast Threshold + Dual Line',
    icon: 'bear',
    blurb:
      "Boosts contrast and thresholds to pull out thin strokes while rejecting wide fill interiors. Dual Line mode runs two independent luminance-band detectors and merges them into one result, or switch to Fill mode for a soft, stylized ink falloff instead.",
  },
  {
    mode: 'pathH',
    label: 'Hinata',
    technique: 'High Pass + Output Treatments',
    icon: 'sun',
    blurb:
      "Subtracts a blurred version of the image from itself to isolate high-frequency detail, then resolves it through one of 4 output treatments — Edge, Emboss, Erode, or Tone — each reading closer to a soft, painterly response than a hard line.",
  },
  {
    mode: 'pathI',
    label: 'Tsukiko',
    technique: 'Laplacian + Output Treatments',
    icon: 'moon',
    blurb:
      "A single-pass second-order edge kernel — grittier and more detail-sensitive than High Pass — with the same 4 Edge/Emboss/Erode/Tone output treatments as Hinata, plus optional pre-blur/post-sharpen to tune noise vs. definition.",
  },
]

interface AlgoGalleryModalProps {
  open: boolean
  onClose: () => void
  /** Which algo tab to land on when the modal opens — the Line Art panel's own "i" button passes
   * the currently active algorithm; BlankState's "Browse Gallery" button (v0.3 polish pass, no
   * image loaded yet so there's no "active algorithm" in the usual sense) just passes whatever
   * App.tsx's own lineArtMode currently is (its default, unaffected by hasImage). */
  initialAlgo: LineArtMode
  /** `options.skipImage` (v0.3 polish pass) — Load Preset applies the preset's tuning without
   * touching the currently loaded photo; Load Demo (default) also swaps in the preset's own demo
   * photo, per applyPreset.ts's own doc comment. */
  onLoadPreset: (presetId: string, options?: { skipImage?: boolean }) => void
  /** Load Preset only makes sense with a photo already loaded to apply the tuning onto — disabled
   * (not hidden, so its existence stays discoverable) while `hasImage` is false, e.g. opened via
   * BlankState's "Browse Gallery" before any photo exists yet. */
  hasImage: boolean
}

/**
 * "Line Expansion Algorithms" info/gallery modal — extracted out of LineArtPanel.tsx (v0.3 polish
 * pass) so it can also be opened from BlankState's "Browse Gallery" button, before any image (and
 * therefore before LineArtPanel itself) exists. LineArtPanel's own "i" button now just calls
 * `onOpenGallery` (App.tsx owns the open/closed state), same as BlankState's button does.
 */
export default function AlgoGalleryModal({ open, onClose, initialAlgo, onLoadPreset, hasImage }: AlgoGalleryModalProps) {
  // Which algorithm's tab is showing inside the modal — independent of the app's actual live
  // algorithm, re-seeded from `initialAlgo` every time the modal opens (see the effect below),
  // not hardcoded to Botan.
  const [modalAlgo, setModalAlgo] = useState<LineArtMode>(initialAlgo)
  // Which preset (within modalAlgo's own PRESET_MANIFEST entries) the gallery card shows — reset
  // to 0 whenever modalAlgo changes so a stale index from a previous tab can't point past the
  // new tab's own (possibly shorter) preset list.
  const [galleryIndex, setGalleryIndex] = useState(0)

  useEffect(() => {
    if (open) { setModalAlgo(initialAlgo); setGalleryIndex(0) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const modalAlgoInfo = ALGO_INFO.find((info) => info.mode === modalAlgo)!
  const modalPresets = PRESET_MANIFEST.filter((p) => p.algo === modalAlgo)
  const activePreset = modalPresets[galleryIndex] ?? modalPresets[0]

  return (
    <Modal open={open} onClose={onClose} title="Line Expansion Algorithms" size="large">
      {/* Modal-local tab row — switches which algorithm's info/gallery this modal shows, entirely
          separate from the app's own live algorithm. Reuses .lineart-algoselector-row's existing
          flex-wrap so 7 pills wrap onto multiple lines at the modal's fixed width instead of
          overflowing into a horizontal scroll strip (a deliberate deviation from the Figma
          reference, which showed a scroll strip — wrapping matches the rest of this app's pill
          rows). */}
      <div className="lineart-algoselector-row algo-modal-tabs">
        {ALGO_OPTIONS.map((opt) => (
          <IconButton
            key={opt.mode}
            icon={opt.icon}
            variant="secondary"
            active={opt.mode === modalAlgo}
            onClick={() => { setModalAlgo(opt.mode); setGalleryIndex(0) }}
          >
            {opt.label}
          </IconButton>
        ))}
      </div>

      {/* Only algorithms with at least one PRESET_MANIFEST entry get a gallery card — today
          that's Chie/Fumiko/Hinata only; the other 4 just show the tab + info blurb below,
          same as before this modal grew a gallery. */}
      {activePreset && (
        <div className="preset-gallery">
          <div className="preset-gallery-images">
            <img src={activePreset.beforeImage} alt={`${activePreset.algoLabel} demo, before`} className="preset-gallery-image" />
            <img src={activePreset.afterImage} alt={`${activePreset.algoLabel} demo, after`} className="preset-gallery-image" />
          </div>
          {/* Attribution row hidden for now (v0.3 polish pass) — credit is optional and unset on
              every preset today (the app author's own work), and Load Demo moved below, so
              there's nothing left to show here until real credits are supplied. */}
          {modalPresets.length > 1 && (
            <div className="preset-gallery-pager">
              {modalPresets.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pill-toggle-btn font-button-label${i === galleryIndex ? ' active' : ''}`}
                  onClick={() => setGalleryIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          {/* Load Demo / Load Preset row (v0.3 polish pass) — moved out of the gallery's old
              attribute row (now hidden above) into its own row below the preset pager, per
              direction. Load Preset disabled (not hidden) with no photo loaded yet — there'd be
              nothing to apply the tuning onto. */}
          <div className="crop-bottomcontent" style={{ padding: 0, paddingLeft: 15, marginTop: 10 }}>
            <IconButton icon="upload" onClick={() => { onLoadPreset(activePreset.id); onClose() }}>
              Load Demo
            </IconButton>
            <IconButton
              icon="slider"
              disabled={!hasImage}
              onClick={() => { onLoadPreset(activePreset.id, { skipImage: true }); onClose() }}
            >
              Load Preset
            </IconButton>
          </div>
        </div>
      )}

      <div className="algo-info-entry">
        <div className="algo-info-entry-title">
          <Icon name={modalAlgoInfo.icon} size={20} color="var(--accent-title)" className="icon" />
          <span className="font-button-label" style={{ color: 'var(--accent-title)' }}>{modalAlgoInfo.label}</span>
          <span className="font-value algo-info-entry-technique" style={{ color: 'var(--accent-dark)', opacity: 0.7 }}>{modalAlgoInfo.technique}</span>
        </div>
        <p className="algo-info-entry-body">{modalAlgoInfo.blurb}</p>
      </div>
    </Modal>
  )
}
