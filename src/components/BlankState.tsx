import { useState, type DragEvent } from 'react'
import Icon from './Icon'

interface BlankStateProps {
  onLoadFile: (file: File) => void
  /** Follow the header's square/circle toggle even before an image is loaded — otherwise the dashed border stays square-rounded while the outer viewport clip (see PreviewViewport) goes circular, leaving stray dash fragments clipped at odd angles. */
  circle: boolean
}

export default function BlankState({ onLoadFile, circle }: BlankStateProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onLoadFile(file)
  }

  return (
    <div className="blank-state-area">
      <label
        className={`blank-state-uploadbox${dragOver ? ' drag-over' : ''}`}
        style={{ borderRadius: circle ? '50%' : undefined }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
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
    </div>
  )
}
