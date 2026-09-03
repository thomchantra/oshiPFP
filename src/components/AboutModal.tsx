import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import SegmentedControl from './SegmentedControl'
import IconButton from './IconButton'
import { type IconName } from './Icon'
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
  /** Live Lab/Simplified toggle state. The Help tab shows a different Line Art topic per mode
   * (a consolidated "Line Art Tab" entry for Simplified vs the Workspaces/Blending/Tuning Tips
   * trio that only exist in Lab). */
  labMode: boolean
}

const TABS: { value: AboutTab; label: string }[] = [
  { value: 'help', label: 'Help' },
  { value: 'about', label: 'About' },
  { value: 'changelog', label: 'Changelog' },
]

type HelpVisibility = 'both' | 'lab' | 'simplified'
interface HelpTopic {
  key: string
  label: string
  icon: IconName
  show: HelpVisibility
}

/** Ordered Help topics. "Lab Mode" sits ahead of the Line Art entry per the 0.5 scope note; the
 * Line Art entry itself swaps by mode (consolidated tab overview in Simplified, the 3-workspace
 * split in Lab), and Blending / Tuning Tips only exist in Lab. */
const HELP_TOPICS: HelpTopic[] = [
  { key: 'workflow', label: 'Workflow', icon: 'edit', show: 'both' },
  { key: 'navigation', label: 'Navigation', icon: 'hand', show: 'both' },
  { key: 'viewmode', label: 'Viewport View Mode', icon: 'eye', show: 'both' },
  { key: 'labmode', label: 'Lab Mode', icon: 'flask', show: 'both' },
  { key: 'lineart-tab', label: 'Line Art Tab', icon: 'lineart', show: 'simplified' },
  { key: 'workspaces', label: 'Line Art Workspaces', icon: 'lineart', show: 'lab' },
  { key: 'blending', label: 'Blending', icon: 'layer', show: 'lab' },
  { key: 'curve', label: 'Curve Graph', icon: 'curve', show: 'both' },
  { key: 'tuning-tips', label: 'Tuning Tips', icon: 'wrench', show: 'lab' },
]

/**
 * About/Help modal, opened by the header's Help icon. 3 tabs: Help/About/Changelog.
 */
export default function AboutModal({ open, onClose, initialTab = 'about', theme, labMode }: AboutModalProps) {
  const [tab, setTab] = useState<AboutTab>(initialTab)

  const topics = useMemo(
    () => HELP_TOPICS.filter((t) => t.show === 'both' || t.show === (labMode ? 'lab' : 'simplified')),
    [labMode],
  )
  const [topicKey, setTopicKey] = useState<string>(topics[0].key)
  const activeTopic = topics.find((t) => t.key === topicKey) ?? topics[0]

  useEffect(() => {
    if (open) setTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Keep the selection valid when the topic list changes (mode toggled while the modal is open, or
  // the modal reopens) — fall back to the first topic rather than showing an empty body.
  useEffect(() => {
    if (!topics.some((t) => t.key === topicKey)) setTopicKey(topics[0].key)
  }, [topics, topicKey])

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
          <div className="help-topic-row">
            {topics.map((t) => (
              <IconButton
                key={t.key}
                icon={t.icon}
                variant="secondary"
                active={t.key === activeTopic.key}
                onClick={() => setTopicKey(t.key)}
              >
                {t.label}
              </IconButton>
            ))}
          </div>

          <div className="help-topic-body">
            {activeTopic.key === 'workflow' && (
              <div className="algo-info-entry">
                <p className="algo-info-entry-title font-param-label">Workflow</p>
                <p className="algo-info-entry-body">
                  Upload an image, then work through the 4 tabs left to right: <strong>Crop, Lineart, Grade, Export</strong>.<br />
                  Each tab's changes carry forward into the next.
                </p>
              </div>
            )}

            {activeTopic.key === 'navigation' && (
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
            )}

            {activeTopic.key === 'viewmode' && (
              <div className="algo-info-entry">
                <p className="algo-info-entry-title font-param-label">Viewport View Mode</p>
                <p className="algo-info-entry-body">
                  <strong>Original:</strong> The source image, post-crop.<br />
                  <strong>Composite:</strong> The original blended with the lineart processing output.<br />
                  <strong>Overlay:</strong> Just the lineart output on its own, isolated from the original.
                </p>
              </div>
            )}

            {activeTopic.key === 'labmode' && (
              <div className="algo-info-entry">
                <p className="algo-info-entry-title font-param-label">Lab Mode</p>
                <p className="algo-info-entry-body">
                  Lab mode exposes all parameters for detailed adjustments.<br /><br />
                  Switch to this mode for full tuning control, or if you prefer the classic oshiPFP experience.
                </p>
              </div>
            )}

            {activeTopic.key === 'lineart-tab' && (
              <div className="algo-info-entry">
                <p className="algo-info-entry-title font-param-label">Line Art Tab</p>
                <p className="algo-info-entry-body">
                  The Line Art tab houses various stylized line art processing filters, ranging from line expansion, line augmentation, alternate shading and colorization.<br /><br />
                  Tap a filter in the carousel to apply it. Tap the selected filter again to fine-tune its preset.<br /><br />
                  In the Edit Preset screen, press the checkmark icon to confirm changes. Press the x icon to discard changes and return to the carousel gallery.<br /><br />
                  If the image is too small, line art filters may yield harsh, jagged results. Try enlarging in 'Resize' section under 'Crop' tab. 800px is a good starting point. For extreme cases, try processing the image through upscalers like waifu2x or Upscayl first.
                </p>
              </div>
            )}

            {activeTopic.key === 'workspaces' && (
              <div className="algo-info-entry">
                <p className="algo-info-entry-title font-param-label">Line Art Workspaces</p>
                <p className="algo-info-entry-body">
                  The Line Art tab splits into 3 subtabs:<br />
                  <strong>Tuning:</strong> Fine-tunes what the lineart module "sees" before it runs.<br />
                  <strong>Lineart:</strong> Houses line art expansion modes and parameters.<br />
                  <strong>Blending:</strong> Tweaks how the result composites onto your image.
                </p>
              </div>
            )}

            {activeTopic.key === 'blending' && (
              <div className="algo-info-entry">
                <p className="algo-info-entry-title font-param-label">Blending</p>
                <p className="algo-info-entry-body">
                  <strong>Color Correct:</strong> Optional color correction applied to the line art right before it blends onto your image.<br />
                  <strong>Blend Mode:</strong> 12 modes across 4 groups (Composite/Lighten/Darken/Contrast); each group's 3 modes run mild to strong left to right.<br />
                  <strong>Overlay Passthrough:</strong> Output lineart processing result straight onto a flat matte color instead, useful for solid-background exports.
                </p>
              </div>
            )}

            {activeTopic.key === 'curve' && (
              <div className="algo-info-entry">
                <p className="algo-info-entry-title font-param-label">Curve Graph</p>
                <p className="algo-info-entry-body">
                  Double-tap the curve line to add a new point.<br />
                  Double-tap an existing point to remove it.<br />
                  Double-tap the curve's floor or ceiling to reset it to its default position.
                </p>
              </div>
            )}

            {activeTopic.key === 'tuning-tips' && (
              <div className="algo-info-entry">
                <p className="algo-info-entry-title font-param-label">Tuning Tips</p>
                <ul className="algo-info-entry-body">
                  <li className="changelogbullet">
                    Not sure where to start? Press the 'i' icon next to 'Line Art Expansion Algorithm' to view the gallery showcase.
                  </li>
                  <li className="changelogbullet">
                    If the image is too small, line art filters may yield harsh, jagged results. Try enlarging in 'Resize' section under 'Crop' tab. 800px is a good starting point. For extreme cases, try processing the image through upscalers like waifu2x or Upscayl first.
                  </li>                
                  <li className="changelogbullet">
                    Fill Type works the same way everywhere:<br />
                    <strong>Image</strong> samples color straight from the artwork,<br />
                    <strong>Solid Color</strong> fills a flat single color,<br />
                    <strong>Gradient Map</strong> colorizes across the image's luminance.
                  </li>
                  <li className="changelogbullet">
                    If an algorithm is missing lines or picking up noise, try the <strong>Tuning</strong> subtab; cleaning up the input first helps refine lineart output.
                  </li>
                  <li className="changelogbullet">
                    When in doubt, switch to Overlay view: it isolates the line art module's own output, so it's much easier to see exactly what each slider is doing.
                  </li>
                  <li className="changelogbullet">
                    Overlay view mode currently can't tell white ink apart from transparent pixels. Set a more prominent color temporarily to dial in the parameters first, then switch back once the look is settled.
                  </li>
                </ul>
              </div>
            )}
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
            Everything runs locally in your browser via WebGL. Nothing you upload here leaves your device or touches a server.
          </p>
          <p className="algo-info-entry-body" style={{ marginTop: 10, opacity: 0.7 }}>
            {OSHIPFP_VERSION}
            {' '}thomchantra
          </p>
          <p className="algo-info-entry-body" style={{ marginTop: 10 }}>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="about-modal-link">
              GitHub
            </a>
            {' · '}
            <a href={`${GITHUB_REPO_URL}/issues/new`} target="_blank" rel="noopener noreferrer" className="about-modal-link">
              Report a Bug
            </a>
            {' · '}
            <a href={'https://ko-fi.com/thomchantra'} target="_blank" rel="noopener noreferrer" className="about-modal-link">
              Ko-fi ☕️
            </a>
          </p>
        </>
      )}

      {tab === 'changelog' && (
        <>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">v0.5.0 - 3 Sep 2026</p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">What's New</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                New Simplified mode for the Line Art tab: a carousel of ready-made filters. Tap one to apply it, tap it again to fine-tune its preset.
              </li>
              <li className="changelogbullet">
                All 7 algorithms (Botan, Chie, Daiya, Fumiko, Gumi, Hinata, Tsukiko) ship with curated filter presets, colour-coded per algorithm.
              </li>
              <li className="changelogbullet">
                A "Lab" toggle in the header switches between Simplified mode and the full parameter set.
              </li>
              <li className="changelogbullet">
                Filter thumbnails preview live against your own photo and Grade settings.
              </li>
            </ul>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Improvements</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Hinata and Tsukiko gained a pre-detection Denoise group (Intensity and Threshold) in the edit sheet.
              </li>
              <li className="changelogbullet">
                Adjusting a slider no longer re-runs the denoise pass unless denoise itself changed, so tuning stays smooth.
              </li>
              <li className="changelogbullet">
                Help section reorganised into topic pills, with separate content for Simplified and Lab.
              </li>
              <li className="changelogbullet">
                App title font refreshed.
              </li>
            </ul>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Bug Fixes</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Fixed a filter thumbnail sometimes staying stale after swapping to a different photo.
              </li>
              <li className="changelogbullet">
                Fixed non-square photos rendering squished in the filter carousel thumbnails.
              </li>
              <li className="changelogbullet">
                Fixed the "None" filter thumbnail ignoring Grade settings that every other thumbnail reflected.
              </li>
            </ul>
          </div>

          <hr className="changelog-version-rule" />
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">v0.4.1 - 19 Aug 2026</p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Improvements</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                A new header shortcut opens the algorithm gallery directly, without needing to be on the Line Art tab first.
              </li>
              <li className="changelogbullet">
                Header icon buttons now show a hover tooltip naming what they do.
              </li>
            </ul>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Bug Fixes</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Fixed Grade's "Original" toggle showing the photo from before Line Art processing instead of Line Art's own (ungraded) result.
              </li>
              <li className="changelogbullet">
                Restored Gumi's Fill mode Threshold slider, which had gone missing from the UI despite still driving the underlying detection.
              </li>
            </ul>
          </div>

          <hr className="changelog-version-rule" />
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
                New "Color Correct" module (Exposure, Contrast, Saturation, and Invert Matte), applied to the line art right before it blends onto your photo. Off by default.
              </li>
              <li className="changelogbullet">
                The Line Art tab is now split into 3 subtabs (Tuning, LineArt, and Blending) that stay pinned in place while you scroll.
              </li>
            </ul>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Improvements</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Tuning subtab reordered (Denoise, then Tone Lift, then Color Lift) and always shows all 3 sections' sliders. No more expanding each one.
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
                Fixed the Grade tab getting stuck showing a flattened Overlay preview after switching away from it in the Line Art tab or Dual Pane view. Grade and Export now always reflect the real composited result.
              </li>
              <li className="changelogbullet">
                Fixed Overlay Passthrough's matte color picker leaking its last color through even while the toggle itself was off.
              </li>
              <li className="changelogbullet">
                Fixed the Tuning subtab showing a dead "doesn't apply to this algorithm" message when Chie was selected. It's now hidden instead, and switching to Chie while on Tuning bounces you back to LineArt automatically.
              </li>
            </ul>
          </div>

          <hr className="changelog-version-rule" />
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">v0.3.1 - 15 Aug 2026</p>
          </div>
          <div className="algo-info-entry">
            <p className="algo-info-entry-title font-param-label">Bug Fixes</p>
            <ul className="algo-info-entry-body">
              <li className="changelogbullet">
                Fixed the Crop tab's zoom pill. Double-tapping it now actually resets zoom/pan back to the centered default, instead of doing nothing.
              </li>
            </ul>
          </div>

          <hr className="changelog-version-rule" />
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
