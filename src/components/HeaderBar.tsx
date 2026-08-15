import { useRef, useState, type ChangeEvent, type RefObject } from 'react'
import IconButton from './IconButton'
import IconToggle2 from './IconToggle2'
import AvatarCornerPreview from './AvatarCornerPreview'
import AboutModal, { type AboutTab } from './AboutModal'
import Modal from './Modal'
import Icon from './Icon'
import { OSHIPFP_VERSION } from '../version'

export type PfpMode = 'square' | 'circle'

interface HeaderBarProps {
  onLoadFile: (file: File) => void
  pfpMode: PfpMode
  onPfpModeChange: (mode: PfpMode) => void
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>
  hasImage: boolean
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  /** Desktop-only (App.tsx passes isDesktop through) — Dual Pane has no mobile behavior yet, see
   * oshiPFP v0.3 Workstream C. Omit entirely rather than disable, so it doesn't show up unusable. */
  showDualPaneToggle: boolean
  dualPaneEnabled: boolean
  onToggleDualPane: () => void
  /** Whether a dual-pane split is actually rendering right now (App.tsx's gated
   * dualPaneActive || gradeDualPaneActive) — distinct from dualPaneEnabled (the raw toggle
   * state), which stays true even on tabs where the pipeline has already reverted to single-pane.
   * AvatarCornerPreview's own crop math trusts this to know whether the source canvas is
   * currently single- or double-wide; passing the raw toggle here once corrupted its output after
   * switching off the tab that actually supports Dual Pane while leaving the toggle on. */
  dualPaneActive: boolean
  /** Which of the two dual-pane result textures the corner preview mirrors — see
   * AvatarCornerPreview's doc comment for the composite > overlay > original priority rule
   * (Line Art) — always 1 ("Graded") for Grade's own dual pane, no 3-way ambiguity there. */
  dualPanePriorityIndex: 0 | 1
  /** "Dump State" button (see src/debug/dumpState.ts) — gated on `devMode` (v0.3 polish pass),
   * not a build-time constant: reachable in production too via AvatarCornerPreview's secret
   * 7-tap entrance (see its own doc comment), not just during local `npm run dev`, so it can
   * double as a bug-report tool for real users. */
  onDumpState: () => void
  /** "Load State" (see src/debug/dumpState.ts's parseStateDump) — the reverse of Dump State, for
   * a post-deploy round-trip check: dump on one build, load the same file back in on another,
   * dump again, diff. Same gating as Dump State, sits right next to it. */
  onLoadState: (file: File) => void
  /** Whether the secret dev-mode entrance has been unlocked (see AvatarCornerPreview) — gates
   * this header's Dump State button and AvatarCornerPreview's own smiley->nerd icon swap. */
  devMode: boolean
  onUnlockDevMode: () => void
  /** "Reset oshiPFP" (v0.3 polish pass) — clears the loaded image and every tuned param back to
   * defaults, without a page reload. The confirm modal (open state owned here, same pattern as
   * `aboutOpen` below) calls this only once the user actually confirms. */
  onReset: () => void
}

export default function HeaderBar({
  onLoadFile,
  pfpMode,
  onPfpModeChange,
  sourceCanvasRef,
  hasImage,
  theme,
  onToggleTheme,
  showDualPaneToggle,
  dualPaneEnabled,
  onToggleDualPane,
  dualPaneActive,
  dualPanePriorityIndex,
  onDumpState,
  onLoadState,
  onReset,
  devMode,
  onUnlockDevMode,
}: HeaderBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const stateFileInputRef = useRef<HTMLInputElement | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutInitialTab, setAboutInitialTab] = useState<AboutTab>('about')
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  const openAbout = (tab: AboutTab) => {
    setAboutInitialTab(tab)
    setAboutOpen(true)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onLoadFile(file)
    e.target.value = ''
  }

  const handleStateFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onLoadState(file)
    e.target.value = ''
  }

  const confirmReset = () => {
    setResetConfirmOpen(false)
    onReset()
  }

  return (
    <div className="header-bar">
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} initialTab={aboutInitialTab} theme={theme} />
      <Modal open={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)} title="Confirm Reset oshiPFP?">
        <div className="confirm-modal-actions">
          <button type="button" className="confirm-reset-btn" onClick={confirmReset}>Reset</button>
          <button type="button" className="confirm-cancel-btn" onClick={() => setResetConfirmOpen(false)}>Cancel</button>
        </div>
      </Modal>
      <div className="header-bar-left">
        <div className="header-bar-title-row">
          <button type="button" className="text-reset-btn font-title" style={{ color: 'var(--accent-title)' }} onClick={() => openAbout('about')}>
            oshiPFP
          </button>
          <button
            type="button"
            className="text-reset-btn font-param-label"
            style={{ color: 'var(--accent-dark)', fontSize: 16 }}
            onClick={() => openAbout('changelog')}
          >
            {OSHIPFP_VERSION}
          </button>
          <button type="button" className="reset-btn" aria-label="Reset oshiPFP" onClick={() => setResetConfirmOpen(true)}>
            <Icon name="refresh" size={14} />
          </button>
          <button type="button" className="theme-btn" aria-label="Help" onClick={() => openAbout('help')}>
            <Icon name="question" size={18} color="var(--accent-title)" />
          </button>
          <button type="button" className="theme-btn" aria-label="Toggle light/dark mode" onClick={onToggleTheme}>
            <Icon name={theme === 'light' ? 'sun' : 'moon'} size={18} color="var(--accent-title)" />
          </button>
          {devMode && (
            <button
              type="button"
              className="theme-btn"
              aria-label="Dump debug state to a text file (dev mode)"
              title="Dump debug state (dev mode)"
              onClick={onDumpState}
            >
              <Icon name="download" size={16} color="var(--accent-title)" />
            </button>
          )}
          {devMode && (
            <button
              type="button"
              className="theme-btn"
              aria-label="Load a dumped debug state file (dev mode)"
              title="Load debug state (dev mode)"
              onClick={() => stateFileInputRef.current?.click()}
            >
              <Icon name="upload" size={16} color="var(--accent-title)" />
            </button>
          )}
          <input ref={stateFileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleStateFileChange} />
        </div>
        <div className="header-bar-action-row">
          <IconButton icon="upload" onClick={() => fileInputRef.current?.click()}>
            Upload PFP
          </IconButton>
          {showDualPaneToggle && (
            <IconButton icon="dualpane" active={dualPaneEnabled} onClick={onToggleDualPane}>
              Dual Pane View
            </IconButton>
          )}
          <IconToggle2
            value={pfpMode}
            onChange={onPfpModeChange}
            options={[
              { value: 'square', icon: 'squarefill', label: 'Square preview' },
              { value: 'circle', icon: 'circlefill', label: 'Circle preview' },
            ]}
          />
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>
      </div>
      <AvatarCornerPreview
        sourceCanvasRef={sourceCanvasRef}
        hasImage={hasImage}
        circle={pfpMode === 'circle'}
        dualPaneActive={dualPaneActive}
        dualPanePriorityIndex={dualPanePriorityIndex}
        devMode={devMode}
        onUnlockDevMode={onUnlockDevMode}
      />
    </div>
  )
}
