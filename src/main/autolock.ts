import { powerMonitor } from 'electron'
import type { LockReason, Settings } from '../shared/types'

interface AutoLockOptions {
  settings: () => Settings
  isUnlocked: () => boolean
  lock: (reason: LockReason) => void
}

/** Locks after system-wide idle time, on sleep, and when the screen locks. */
export function startAutoLock({ settings, isUnlocked, lock }: AutoLockOptions): () => void {
  const interval = setInterval(() => {
    const minutes = settings().autoLockMinutes
    if (!minutes || !isUnlocked()) return
    if (powerMonitor.getSystemIdleTime() >= minutes * 60) lock('idle')
  }, 5_000)

  const onSuspend = () => {
    if (settings().lockOnSleep && isUnlocked()) lock('sleep')
  }
  const onScreenLock = () => {
    if (settings().lockOnSleep && isUnlocked()) lock('screen-lock')
  }
  powerMonitor.on('suspend', onSuspend)
  powerMonitor.on('lock-screen', onScreenLock)

  return () => {
    clearInterval(interval)
    powerMonitor.off('suspend', onSuspend)
    powerMonitor.off('lock-screen', onScreenLock)
  }
}
