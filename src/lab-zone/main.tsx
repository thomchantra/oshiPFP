import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import '../styles/base.css'
import LabZoneApp from './LabZoneApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LabZoneApp />
  </StrictMode>,
)
