import Modal from './Modal'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

/**
 * About page, opened by tapping the "oshiPFP" title in the header.
 * EDIT ME: this is the one place to write/update the About content — plain
 * paragraphs below, styled the same way Line Art's algorithm-info modal
 * body text is (see LineArtPanel.tsx's `algo-info-entry-body` class).
 */
export default function AboutModal({ open, onClose }: AboutModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="About oshiPFP">
      <p className="algo-info-entry-body">
        oshiPFP tunes your favorite drawing/illustration into an optimized profile picture that looks great and legible at small thumbnail sizes.
      </p>
      <p className="algo-info-entry-body" style={{ marginTop: 10 }}>
        Explore different config combo with 4 algorithms (Botan, Chie, Daiya, Fumiko) each grow, thicken and texturize linework in a different way.
      </p>
      <p className="algo-info-entry-body" style={{ marginTop: 10 }}>
        Everything runs locally in your browser via WebGL — nothing you upload here leaves your device or touches a server.
      </p>
      <p className="algo-info-entry-body" style={{ marginTop: 10, opacity: 0.7 }}>
        v0.2.2
        thomchantra
      </p>
    </Modal>
  )
}
