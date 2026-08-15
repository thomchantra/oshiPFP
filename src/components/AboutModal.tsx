import { useEffect, useState } from 'react'
import Modal from './Modal'
import SegmentedControl from './SegmentedControl'
import { OSHIPFP_VERSION, GITHUB_REPO_URL } from '../version'

export type AboutTab = 'help' | 'about' | 'changelog'

interface AboutModalProps {
  open: boolean
  onClose: () => void
  /** Which tab to land on when the modal opens — the Help icon opens straight to 'help', the
   * version text opens straight to 'changelog', the "oshiPFP" title opens to 'about'. Defaults to
   * 'about' when omitted (e.g. any future opener that doesn't care which tab). */
  initialTab?: AboutTab
  /** Picks the About tab's hero screenshot (light vs dark app chrome) — HeaderBar already owns
   * this as top-level theme state, so it's threaded down rather than re-derived here. */
  theme: 'light' | 'dark'
}

const TABS: { value: AboutTab; label: string }[] = [
  { value: 'help', label: 'Help' },
  { value: 'about', label: 'About' },
  { value: 'changelog', label: 'Changelog' },
]

/**
 * About/Help modal, opened by the header's Help icon. 3 tabs: Help/About/Changelog.
 */
export default function AboutModal({ open, onClose, initialTab = 'about', theme }: AboutModalProps) {
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

      {/* Plain conditional rendering — the modal itself top-pins (see .modal-backdrop in
          base.css), so a shorter tab is free to size to its own content instead of being padded
          out to Changelog's height; only the position needs pinning, not the height. */}
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
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Tuning Tips</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Not sure where to start? The algorithm info modal's gallery has real before/after examples with their exact settings — Load Preset applies them straight onto your own photo.
              </li>
              <li className="changelogbullet">
                Fill Type works the same way everywhere — Image samples color straight from the artwork, Solid Color fills flat, Gradient Map remaps by luminance across a shadow/mid/highlight ramp.
              </li>
              <li className="changelogbullet">
                If an algorithm is missing lines or picking up noise, check Pre-detection Tuning before reaching for the algorithm's own sliders — cleaning up the input first is often the shorter path.
              </li>
              <li className="changelogbullet">
                When in doubt, switch to Overlay view — it isolates the line art module's own output, so it's much easier to see exactly what each slider is doing. 
                <br></br>
                One caveat: Overlay can't tell white ink apart from fully-transparent (empty) pixels, since both render the same — set a more prominent color temporarily to dial in the shape, then switch back once the look is settled.
              </li>
            </ul>
          </div>
        </>
      )}

      {tab === 'about' && (
        <>
          <img
            src={theme === 'dark' ? '/about/darkscreen.webp' : '/about/lightscreen.webp'}
            alt="oshiPFP app screenshot"
            className="about-modal-hero"
          />
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
          <p className="algo-info-entry-body" style={{ marginTop: 10 }}>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="about-modal-link">
              View on GitHub
            </a>
            {' · '}
            <a href={`${GITHUB_REPO_URL}/issues/new`} target="_blank" rel="noopener noreferrer" className="about-modal-link">
              Report a Bug
            </a>
          </p>
        </>
      )}

      {tab === 'changelog' && (
        <>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">v0.3.1 - 15 Aug 2026</p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Bug Fixes</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Fixed the Crop tab's zoom pill — double-tapping it now actually resets zoom/pan back to the centered default, instead of doing nothing.
              </li>
            </ul>
          </div>
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
