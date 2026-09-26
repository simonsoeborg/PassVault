import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/500.css'
import '@fontsource/atkinson-hyperlegible-next/600.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import '@fontsource/atkinson-hyperlegible-mono/400.css'
import '@fontsource/atkinson-hyperlegible-mono/500.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/rosette.css'
import './styles/gate.css'
import './styles/vault.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

async function start() {
  if (__PASSVAULT_MOCK__) {
    const { installMock } = await import('../mock/install')
    installMock('main')
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
