import { useEffect, useState } from 'react'
import Modal from './Modal'
import SegmentedControl from './SegmentedControl'
import { OSHIPFP_VERSION } from '../version'

export type AboutTab = 'help' | 'about' | 'changelog'

interface AboutModalProps {
  open: boolean
  onClose: () => void
  /** Which tab to land on when the modal opens — the Help icon opens straight to 'help', the
   * version text opens straight to 'changelog', the "oshiPFP" title opens to 'about'. Defaults to
   * 'about' when omitted (e.g. any future opener that doesn't care which tab). */
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

      {/* Plain conditional rendering (v0.3 polish pass, reverted from an earlier stack-all-3-tabs
          height-pinning trick) — now that the modal itself top-pins (see .modal-backdrop in
          base.css), a shorter tab is free to size to its own content instead of being padded out
          to Changelog's height; only the position needed pinning, not the height. */}
      {tab === 'help' && (
        <>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Workflow</p>
            <p className="algo-info-entry-body">
              Upload an image, then work through the 4 tabs left to right: Crop, Line Art, Grade, Export. Each tab's changes carry forward into the next — the live preview above always shows the full result of everything tuned so far.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Navigation</p>
            <p className="algo-info-entry-body">
              In 'Crop' tab, scroll wheel or pinch on the viewport to zoom.<br />
              Double-tap a slider resets to its default value.
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
              Fine-tunes what the line art module "sees" before it runs, try adjusting this section if detection is missing lines or picking up noise.
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
            oshiPFP tunes your drawing/illustration image into an optimized profile picture that looks sharp and legible at small thumbnail sizes.
          </p>
          <p className="algo-info-entry-body" style={{ marginTop: 10 }}>
            Explore different config combos with 7 algorithms (Botan, Chie, Daiya, Fumiko, Gumi, Hinata, Tsukiko), each grows, thickens, colorizes and texturizes in a different way.
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
            <p className="algo-info-entry-title font-param-label">v0.3.0 - 14 Aug 2026</p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">What's New</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                3 new line art algorithms added: Gumi, Hinata, and Tsukiko
              </li>
              <li className="changelogbullet">
                'Gradient Map', a color-remap style shading module added.
              </li>
              <li className="changelogbullet">
                'Dual Pane View' mode for Lineart and Color tab on desktop/wide viewport.
              </li>
              <li className="changelogbullet">
                Line Expansion Info modal now houses gallery as example presets and live demos.
              </li>
            </ul>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Improvements</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Each algorithm mode now includes 3 shading modes: samples color from image, solid color, and gradient map fill options.
              </li>
              <li className="changelogbullet">
                Tuned line thickness sliders on some algorithms to be more precise, addressing stair-stepping line art tuning issue.
              </li>
            </ul>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Bug Fixes</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Fixed line art occasionally rendering with inverted shapes right after switching algorithms.
              </li>
              <li className="changelogbullet">
                Fixed several detection/color settings silently leaking over from one algorithm to another..
              </li>
              <li className="changelogbullet">
                Fixed the Line Art preview not updating live while resizing or repositioning a crop.
              </li>
              <li className="changelogbullet">
                Fixed Gradient Map ignoring color adjustments made afterward in the Grade tab.
              </li>
            </ul>
          </div>
        </>
      )}
    </Modal>
  )
}
