import { useEffect } from 'react'
import { applyTheme } from './lib/theme'
import { Gate } from './screens/Gate'
import { VaultWindow } from './screens/VaultWindow'
import { boot, useStore } from './store'

export function App() {
  const app = useStore((s) => s.app)
  const hold = useStore((s) => s.gateHold)
  const theme = app?.settings.theme ?? 'system'

  useEffect(() => {
    void boot()
  }, [])

  useEffect(() => applyTheme(theme), [theme])

  useEffect(() => {
    if (app) document.documentElement.dataset.platform = app.platform
  }, [app?.platform])

  if (!app) return null
  if (!app.locked && app.vault && !hold) return <VaultWindow app={app} />
  return <Gate app={app} />
}
