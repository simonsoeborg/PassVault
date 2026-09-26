import { createMockApi } from './api'

type MockState = 'unlock' | 'welcome' | 'vault' | 'create' | 'empty'

/** Installs the synthetic API used by the browser design preview only. */
export function installMock(surface: 'main' | 'quick'): void {
  const requested = new URLSearchParams(location.search).get('state')
  const state: MockState =
    requested === 'welcome' || requested === 'vault' || requested === 'create' || requested === 'unlock' || requested === 'empty'
      ? requested
      : surface === 'quick'
        ? 'vault'
        : 'unlock'
  Object.defineProperty(window, 'passvault', { value: createMockApi(state), configurable: true })
}
