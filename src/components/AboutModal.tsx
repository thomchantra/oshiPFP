import { useEffect, useState } from 'react'
import Modal from './Modal'
import SegmentedControl from './SegmentedControl'
import { OSHIPFP_VERSION } from '../version'

export type AboutTab = 'help' | 'about' | 'changelog'

interface AboutModalProps {
  open: boolean
  onClose: () => void
  /** Which tab to land on when the modal opens — the Help icon opens on 'about' (its long-standing
   * default), the version text opens straight to 'changelog', the "oshiPFP" title opens to 'about'
   * explicitly. Defaults to 'about' when omitted. */
  initialTab?: AboutTab
}

const TABS: { value: AboutTab; label: string }[] = [
  { value: 'help', label: 'Help' },
  { value: 'about', label: 'About' },
  { value: 'changelog', label: 'Changelog' },
]

/**
 * About/Help modal, opened by the header's Help icon (v0.3 polish pass — previously opened by
 * tapping the "oshiPFP" title itself). 3 tabs: Help/About/Changelog. Help and Changelog are
 * skeleton content for now, per the v0.3 tuning spec's own scoping — EDIT ME when real copy is
 * ready. About is today's original content, unchanged, just moved into its own tab body.
 */
export default function AboutModal({ open, onClose, initialTab = 'about' }: AboutModalProps) {
  const [tab, setTab] = useState<AboutTab>(initialTab)

  useEffect(() => {
    if (open) setTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="About oshiPFP">
      <div className="algo-modal-tabs">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'help' && (
        <>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Workflow</p>
            <p className="algo-info-entry-body">
              Upload an image, then work through the 4 tabs left to right: Crop, Line Art, Grade, Export. Each tab's changes carry forward into the next — the live preview above always shows the full result of everything tuned so far.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Viewport View Mode</p>
            <p className="algo-info-entry-body">
              <strong>Original</strong> — the source image, post-crop.<br />
              <strong>Composite</strong> — the original blended with the line art processing output.<br />
              <strong>Overlay</strong> — just the line art output on its own, isolated from the original.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Pre-detection Tuning</p>
            <p className="algo-info-entry-body">
              Fine-tunes what the line art module "sees" before it runs — adjust this first if detection is missing lines or picking up noise, before reaching for an algorithm's own sliders.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Navigation</p>
            <p className="algo-info-entry-body">
              Scroll wheel or pinch to zoom the viewport.<br />
              Double-tap a slider to reset it to its default value.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Curve Graph</p>
            <p className="algo-info-entry-body">
              Double-tap the curve line to add a new point.<br />
              Double-tap an existing point to remove it.<br />
              Double-tap the curve's floor or ceiling to reset it to its default position.
            </p>
          </div>
        </>
      )}

      {tab === 'about' && (
        <>
          <p className="algo-info-entry-body">
            oshiPFP tunes your favorite drawing/illustration into an optimized profile picture that looks great and legible at small thumbnail sizes.
          </p>
          <p className="algo-info-entry-body" style={{ marginTop: 10 }}>
            Explore different config combos with 7 algorithms (Botan, Chie, Daiya, Fumiko, Gumi, Hinata, Tsukiko) — each grows, thickens, and texturizes linework in a different way.
          </p>
          <p className="algo-info-entry-body" style={{ marginTop: 10 }}>
            Everything runs locally in your browser via WebGL — nothing you upload here leaves your device or touches a server.
          </p>
          <p className="algo-info-entry-body" style={{ marginTop: 10, opacity: 0.7 }}>
            {OSHIPFP_VERSION}
            {' '}thomchantra
          </p>
        </>
      )}

      {tab === 'changelog' && (
        <>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">v0.3.0</p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">What's New</p>
            <p className="algo-info-entry-body">
              3 new line art algorithms — Gumi, Hinata, and Tsukiko — bringing the total to 7 distinct ways to turn artwork into line art.<br />
              A tone Curve tool and a Gradient Map color-remap tool in the Grade tab.<br />
              Dual Pane split view, to compare two settings side by side on the Line Art and Grade tabs.<br />
              A built-in preset gallery — jump straight into a tuned style instead of starting from scratch.<br />
              A one-tap Reset button to clear everything without reloading the page.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Improvements</p>
            <p className="algo-info-entry-body">
              Every algorithm now shares the same Image / Solid Color / Gradient Map fill options, with an Invert toggle.<br />
              Line thickness sliders are smoother and more precise across the board, no more stair-stepping.<br />
              Better default values across every algorithm, tuned against real artwork rather than guesses.<br />
              The About panel now has Help, About, and Changelog tabs instead of just one block of text.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Bug Fixes</p>
            <p className="algo-info-entry-body">
              Fixed line art occasionally rendering with inverted shapes right after switching algorithms.<br />
              Fixed several detection/color settings silently leaking over from one algorithm to another.<br />
              Fixed the Line Art preview not updating live while resizing or repositioning a crop.<br />
              Fixed Gradient Map ignoring color adjustments made afterward in the Grade tab.
            </p>
          </div>
        </>
      )}
    </Modal>
  )
}
