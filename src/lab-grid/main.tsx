import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LabGridApp from './LabGridApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LabGridApp />
  </StrictMode>,
)
