import Card from './Card'
import { usePipeline } from '../gl/usePipeline'

export default function CropPanel() {
  const { canvasRef, error, sourceSize, loadFile } = usePipeline()

  return (
    <Card title="Crop" dot={error ? 'amber' : 'dim'} meta="1:1">
      <div style={{ marginBottom: 12 }}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void loadFile(file)
          }}
        />
      </div>
      {error && (
        <p style={{ color: 'var(--red)', marginBottom: 12 }}>
          {error}
        </p>
      )}
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          maxWidth: 360,
          margin: '0 auto',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          background: 'var(--bg)',
          border: '1px solid var(--line2)',
        }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
      {sourceSize && (
        <p style={{ color: 'var(--text3)', marginTop: 10, fontSize: 12 }}>
          Loaded source: {sourceSize.width}×{sourceSize.height}px (pan/zoom coming soon)
        </p>
      )}
    </Card>
  )
}
