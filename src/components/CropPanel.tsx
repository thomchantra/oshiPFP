import Card from './Card'

interface CropPanelProps {
  sourceSize: { width: number; height: number } | null
  zoom: number
  onLoadFile: (file: File) => void
}

export default function CropPanel({ sourceSize, zoom, onLoadFile }: CropPanelProps) {
  return (
    <Card title="Crop controls" dot="dim" meta="1:1">
      <div style={{ marginBottom: 12 }}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onLoadFile(file)
          }}
        />
      </div>
      {sourceSize ? (
        <p style={{ color: 'var(--text3)', fontSize: 12 }}>
          {sourceSize.width}×{sourceSize.height}px · zoom {zoom.toFixed(2)}× · drag the preview above to pan, pinch/scroll to
          zoom
        </p>
      ) : (
        <p style={{ color: 'var(--text3)', fontSize: 12 }}>Choose an image to begin.</p>
      )}
    </Card>
  )
}
