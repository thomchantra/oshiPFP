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
              Upload an image, then work through the 4 tabs left to right: <strong>Crop, Lineart, Grade, Export</strong><br />
              Each tab's changes carry forward into the next.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Navigation</p>
            <p className="algo-info-entry-body">
              <strong>In 'Crop' tab:</strong> Scroll wheel/pinch on the viewport to zoom. Double-tap <strong>Zoom Pill</strong> to reset crop.<br />
              <br />
              Double-tap a slider resets to its default value.<br /><br />
              On mobile, tap the active tab again to unselect it.<br />
              This hides the panel entirely and gives the preview the full viewport.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Viewport View Mode</p>
            <p className="algo-info-entry-body">
              <strong>Original:</strong> The source image, post-crop.<br />
              <strong>Composite:</strong> The original blended with the lineart processing output.<br />
              <strong>Overlay:</strong> Just the lineart output on its own, isolated from the original.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Line Art Workspaces</p>
            <p className="algo-info-entry-body">
              The Line Art tab splits into 3 subtabs:<br></br>
              <strong>Tuning:</strong> Fine-tunes what the lineart module "sees" before it runs.<br></br>
              <strong>Lineart:</strong> Houses line art expansion modes and parameters.<br></br>
              <strong>Blending:</strong> Tweaks how the result composites onto your image.
            </p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Blending</p>
            <p className="algo-info-entry-body">
              <strong>Color Correct:</strong> Optional color correction applied to the line art right before it blends onto your image.<br />
              <strong>Blend Mode:</strong> 12 modes across 4 groups (Composite/Lighten/Darken/Contrast); each group's 3 modes run mild to strong left to right.<br />
              <strong>Overlay Passthrough:</strong> Output lineart processing result straight onto a flat matte color instead, useful for solid-background exports.
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
                Not sure where to start? Press the 'i' icon next to 'Line Art Expansion Algorithm' to view gallery showcase.
              </li>
              <li className="changelogbullet">
                Fill Type works the same way everywhere:<br />
                <strong>Image</strong> samples color straight from the artwork,<br />
                <strong>Solid Color</strong> fills flat single color,<br />
                <strong>Gradient Map</strong> colorizes across image's luminance.
              </li>
              <li className="changelogbullet">
                If an algorithm is missing lines or picking up noise, try adjust <strong>Tuning</strong> subtab; cleaning up the input first helps refine lineart output.
              </li>
              <li className="changelogbullet">
                When in doubt, switch to Overlay view: it isolates the line art module's own output, so it's much easier to see exactly what each slider is doing.
              </li>
              <li className="changelogbullet">
                Overlay view mode currently can't tell white ink apart from transparent pixels. Set a more prominent color temporarily to dial in the parameters first, then switch back once the look is settled.
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
            <p className="algo-info-entry-title font-param-label">v0.4.0 - 17 Aug 2026</p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">What's New</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Blend modes expanded from 6 to 12, grouped into Composite/Lighten/Darken/Contrast (adds Add, Color Dodge, Darker Color, Linear Burn, Soft Light, and Hard Light).
              </li>
              <li className="changelogbullet">
                New "Color Correct" module — Exposure, Contrast, Saturation, and Invert Matte, applied to the line art right before it blends onto your photo. Off by default.
              </li>
              <li className="changelogbullet">
                The Line Art tab is now split into 3 subtabs — Tuning, LineArt, and Blending — that stay pinned in place while you scroll.
              </li>
            </ul>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Improvements</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Tuning subtab reordered (Denoise, then Tone Lift, then Color Lift) and always shows all 3 sections' sliders — no more expanding each one.
              </li>
              <li className="changelogbullet">
                Grade tab's Light/Color/HSL subtabs also stay pinned in place while scrolling.
              </li>
              <li className="changelogbullet">
                Algorithm picker is a single scrollable row on mobile instead of wrapping awkwardly.
              </li>
              <li className="changelogbullet">
                Tuning and Grade sliders now show percentages instead of raw decimals, matching Blending's style.
              </li>
            </ul>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Bug Fixes</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Fixed Fumiko's Find Edge mode ignoring Overlay Passthrough's matte color and always showing a plain white background instead.
              </li>
              <li className="changelogbullet">
                Fixed the Grade tab getting stuck showing a flattened Overlay preview after switching away from it in the Line Art tab or Dual Pane view — Grade and Export now always reflect the real composited result.
              </li>
              <li className="changelogbullet">
                Fixed Overlay Passthrough's matte color picker leaking its last color through even while the toggle itself was off.
              </li>
              <li className="changelogbullet">
                Fixed the Tuning subtab showing a dead "doesn't apply to this algorithm" message when Chie was selected — it's now hidden instead, and switching to Chie while on Tuning bounces you back to LineArt automatically.
              </li>
            </ul>
          </div>
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
