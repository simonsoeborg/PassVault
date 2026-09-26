// Biometric user verification through the operating system: Touch ID on macOS,
// Windows Hello on Windows, fprintd on Linux. Verification only proves presence;
// the key it releases is protected separately by the OS keystore (see quickUnlock.ts).

import { safeStorage, systemPreferences } from 'electron'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import type { BiometricInfo } from '../../shared/types'
import { findExecutable, run } from '../exec'
import {
  fprintdHasEnrolledFinger,
  fprintdOutcome,
  helloAvailability,
  helloScript,
  helloVerification,
  parseIntegerOutput,
  type VerifyOutcome,
} from './parse'

let cache: { info: BiometricInfo; at: number } | null = null
const CACHE_MS = 60_000

function secureStorageStatus(): { ok: boolean; reason?: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, reason: 'The system keystore is not available, so PassVault cannot keep a quick-unlock key.' }
  }
  if (process.platform === 'linux') {
    const backend = safeStorage.getSelectedStorageBackend()
    if (backend === 'basic_text' || backend === 'unknown') {
      return { ok: false, reason: 'A keyring such as GNOME Keyring or KWallet is needed to keep a quick-unlock key.' }
    }
  }
  return { ok: true }
}

function powershell(): string {
  const root = process.env.SystemRoot ?? 'C:\\Windows'
  return findExecutable('powershell', [join(root, 'System32', 'WindowsPowerShell', 'v1.0')]) ?? 'powershell.exe'
}

async function probe(): Promise<BiometricInfo> {
  const storage = secureStorageStatus()
  const base = { secureStorage: storage.ok }

  if (process.platform === 'darwin') {
    const available = systemPreferences.canPromptTouchID()
    return {
      ...base,
      kind: 'touch-id',
      available: available && storage.ok,
      reason: !available ? 'Touch ID is not available or not set up on this Mac.' : storage.reason,
    }
  }

  if (process.platform === 'win32') {
    try {
      const result = await run(powershell(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
        input: helloScript('check'),
        timeoutMs: 20_000,
      })
      const code = parseIntegerOutput(result.stdout)
      const hello = helloAvailability(code ?? -1)
      return { ...base, kind: 'windows-hello', available: hello.available && storage.ok, reason: hello.reason ?? storage.reason }
    } catch {
      return { ...base, kind: 'windows-hello', available: false, reason: 'Windows Hello could not be reached.' }
    }
  }

  const list = findExecutable('fprintd-list')
  if (!list || !findExecutable('fprintd-verify')) {
    return { ...base, kind: 'none', available: false, reason: 'Install fprintd and enroll a finger to unlock with a fingerprint.' }
  }
  try {
    const result = await run(list, [userInfo().username], { timeoutMs: 10_000 })
    const enrolled = fprintdHasEnrolledFinger(result.stdout + result.stderr)
    return {
      ...base,
      kind: 'fprintd',
      available: enrolled && storage.ok,
      reason: !enrolled ? 'No fingerprint is enrolled with fprintd.' : storage.reason,
    }
  } catch {
    return { ...base, kind: 'fprintd', available: false, reason: 'fprintd could not be reached.' }
  }
}

export async function getBiometricInfo(force = false): Promise<BiometricInfo> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.info
  const info = await probe()
  cache = { info, at: Date.now() }
  return info
}

export async function verifyUser(reason: string): Promise<VerifyOutcome> {
  const info = await getBiometricInfo()
  if (!info.available) return 'unavailable'

  if (process.platform === 'darwin') {
    try {
      await systemPreferences.promptTouchID(reason)
      return 'verified'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return /cancel/i.test(message) ? 'cancelled' : 'failed'
    }
  }

  if (process.platform === 'win32') {
    try {
      const result = await run(powershell(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
        input: helloScript('verify', reason),
        timeoutMs: 90_000,
      })
      if (result.timedOut) return 'cancelled'
      return helloVerification(parseIntegerOutput(result.stdout) ?? -1)
    } catch {
      return 'unavailable'
    }
  }

  const verify = findExecutable('fprintd-verify')
  if (!verify) return 'unavailable'
  try {
    const result = await run(verify, [], { timeoutMs: 30_000 })
    return fprintdOutcome(result.stdout + result.stderr, result.timedOut)
  } catch {
    return 'unavailable'
  }
}
