import { useState, type DragEvent } from 'react'
import Icon from './Icon'
import IconButton from './IconButton'

interface BlankStateProps {
  onLoadFile: (file: File) => void
  /** Follow the header's square/circle toggle even before an image is loaded — otherwise the dashed border stays square-rounded while the outer viewport clip (see PreviewViewport) goes circular, leaving stray dash fragments clipped at odd angles. */
  circle: boolean
  /** Opens AlgoGalleryModal — lets someone browse the algorithm/preset gallery and pick a
   * "Load Demo" before ever uploading their own photo. */
  onBrowseGallery: () => void
}

export default function BlankState({ onLoadFile, circle, onBrowseGallery }: BlankStateProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onLoadFile(file)
  }

  return (
    <div className="blank-state-area">
      {/* Drag handlers live on this plain div (not a <label>) so "Browse Gallery" below can be a
          normal sibling button — a button nested inside a <label> associated with the file input
          risks also triggering the file picker on click. The <label> below is scoped tightly to
          just the icon/text/input, the actual click-to-browse-files affordance. */}
      <div
        className={`blank-state-uploadbox${dragOver ? ' drag-over' : ''}`}
        style={{ borderRadius: circle ? '50%' : undefined }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <label className="blank-state-upload-label">
          <Icon name="upload" size={40} color="var(--accent-dark)" />
          <span className="font-button-label" style={{ color: 'var(--accent-dark)' }}>
            Upload/Drag PFP image to begin
          </span>
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onLoadFile(file)
              e.target.value = ''
            }}
          />
        </label>
        <IconButton onClick={onBrowseGallery}>Browse Gallery</IconButton>
      </div>
    </div>
  )
}
