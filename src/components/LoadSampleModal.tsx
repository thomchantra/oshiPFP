import Modal from './Modal'

interface LoadSampleModalProps {
  open: boolean
  onClose: () => void
}

/** Stub — Simplified mode's "Load Sample Image" replaces Advanced mode's algorithm-gallery button
 * (see HeaderBar.tsx), since the demo-preset gallery concept doesn't apply here. This is meant to
 * become a picker over the same sample photos the presets/filters were built from (the original
 * before.webp set) so a user with no photo of their own can still try filters — flagged during
 * Stage E UI testing, not yet designed; this stub exists so the button has somewhere real to go
 * rather than being wired to a no-op. */
export default function LoadSampleModal({ open, onClose }: LoadSampleModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Load Sample Image">
      <p className="font-value" style={{ color: 'var(--accent-dark)', opacity: 0.7 }}>
        Coming soon — this will let you try filters on a sample photo without uploading your own.
      </p>
    </Modal>
  )
}
