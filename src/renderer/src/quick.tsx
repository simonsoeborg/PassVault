import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/500.css'
import '@fontsource/atkinson-hyperlegible-next/600.css'
import '@fontsource/atkinson-hyperlegible-mono/400.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/rosette.css'
import './styles/quick.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QuickApp } from './quick/QuickApp'

async function start() {
  if (__PASSVAULT_MOCK__) {
    const { installMock } = await import('../mock/install')
    installMock('quick')
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QuickApp />
    </StrictMode>,
  )
}

void start()
