/// <reference types="vite/client" />
import type { PassVaultApi } from '../../shared/api'

declare global {
  interface Window {
    passvault: PassVaultApi
  }
  /** True only in the browser design preview, where a synthetic API stands in for Electron. */
  const __PASSVAULT_MOCK__: boolean
}

export {}
