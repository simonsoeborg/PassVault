// Pure helpers for the OS biometric bridges, kept free of Electron imports so they can be tested.

export type VerifyOutcome = 'verified' | 'cancelled' | 'unavailable' | 'failed'

/** Windows.Security.Credentials.UI.UserConsentVerifierAvailability */
export function helloAvailability(code: number): { available: boolean; reason?: string } {
  switch (code) {
    case 0:
      return { available: true }
    case 1:
      return { available: false, reason: 'No Windows Hello camera or fingerprint reader was found.' }
    case 2:
      return { available: false, reason: 'Windows Hello is not set up for this account.' }
    case 3:
      return { available: false, reason: 'Windows Hello is disabled by policy on this device.' }
    case 4:
      return { available: false, reason: 'The Windows Hello device is busy.' }
    default:
      return { available: false, reason: 'Windows Hello could not be reached.' }
  }
}

/** Windows.Security.Credentials.UI.UserConsentVerificationResult */
export function helloVerification(code: number): VerifyOutcome {
  if (code === 0) return 'verified'
  if (code === 6) return 'cancelled'
  if (code === 5) return 'failed'
  return 'unavailable'
}

export function helloScript(mode: 'check' | 'verify', reason = ''): string {
  const reasonBase64 = Buffer.from(reason, 'utf8').toString('base64')
  const ns = 'Windows.Security.Credentials.UI'
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    "$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1",
    'function Await($op, [Type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }',
    `$null = [${ns}.UserConsentVerifier, ${ns}, ContentType = WindowsRuntime]`,
    `$null = [${ns}.UserConsentVerifierAvailability, ${ns}, ContentType = WindowsRuntime]`,
    `$null = [${ns}.UserConsentVerificationResult, ${ns}, ContentType = WindowsRuntime]`,
    mode === 'check'
      ? `[int](Await ([${ns}.UserConsentVerifier]::CheckAvailabilityAsync()) ([${ns}.UserConsentVerifierAvailability]))`
      : [
          `$reason = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${reasonBase64}'))`,
          `[int](Await ([${ns}.UserConsentVerifier]::RequestVerificationAsync($reason)) ([${ns}.UserConsentVerificationResult]))`,
        ].join('\n'),
  ].join('\n')
}

export function parseIntegerOutput(stdout: string): number | null {
  const match = stdout.trim().match(/(-?\d+)\s*$/)
  return match ? Number(match[1]) : null
}

export function fprintdHasEnrolledFinger(listOutput: string): boolean {
  if (/has no fingers enrolled/i.test(listOutput) || /no devices available/i.test(listOutput)) return false
  return /Fingers? enrolled|^\s*-\s*#\d+:/im.test(listOutput)
}

export function fprintdOutcome(verifyOutput: string, timedOut: boolean): VerifyOutcome {
  if (/verify-match/.test(verifyOutput)) return 'verified'
  if (/verify-no-match|verify-retry-scan|verify-swipe-too-short|verify-finger-not-centered/.test(verifyOutput)) return 'failed'
  if (timedOut || /verify-disconnected|verify-unknown-error/.test(verifyOutput)) return 'cancelled'
  if (/No devices available|NoSuchDevice|NoEnrolledPrints/i.test(verifyOutput)) return 'unavailable'
  return 'failed'
}
