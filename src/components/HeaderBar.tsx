import { useRef, useState, type ChangeEvent, type RefObject } from 'react'
import IconButton from './IconButton'
import IconToggle2 from './IconToggle2'
import AvatarCornerPreview from './AvatarCornerPreview'
import AboutModal from './AboutModal'
import Icon from './Icon'

export type PfpMode = 'square' | 'circle'

interface HeaderBarProps {
  onLoadFile: (file: File) => void
  pfpMode: PfpMode
  onPfpModeChange: (mode: PfpMode) => void
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>
  hasImage: boolean
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function HeaderBar({
  onLoadFile,
  pfpMode,
  onPfpModeChange,
  sourceCanvasRef,
  hasImage,
  theme,
  onToggleTheme,
}: HeaderBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onLoadFile(file)
    e.target.value = ''
  }

  return (
    <div className="header-bar">
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <div className="header-bar-left">
        <div className="header-bar-title-row">
          <button
            type="button"
            className="font-title"
            style={{ color: 'var(--accent-title)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            onClick={() => setAboutOpen(true)}
          >
            oshiPFP
          </button>
          <span className="font-param-label" style={{ color: 'var(--accent-dark)', fontSize: 16 }}>v0.2.2</span>
          <button type="button" className="theme-btn" aria-label="Toggle light/dark mode" onClick={onToggleTheme}>
            <Icon name={theme === 'light' ? 'sun' : 'moon'} size={18} color="var(--accent-title)" />
          </button>
        </div>
        <div className="header-bar-action-row">
          <IconButton icon="upload" onClick={() => fileInputRef.current?.click()}>
            Upload PFP
          </IconButton>
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
      <AvatarCornerPreview sourceCanvasRef={sourceCanvasRef} hasImage={hasImage} circle={pfpMode === 'circle'} />
    </div>
  )
}
