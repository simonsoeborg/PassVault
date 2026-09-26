import { ZxcvbnFactory } from '@zxcvbn-ts/core'
import { adjacencyGraphs, dictionary } from '@zxcvbn-ts/language-common'
import type { StrengthEstimate } from '../shared/types'

let factory: ZxcvbnFactory | null = null

function zxcvbn(): ZxcvbnFactory {
  factory ??= new ZxcvbnFactory({ dictionary: { ...dictionary }, graphs: adjacencyGraphs, useLevenshteinDistance: true })
  return factory
}

const WARNINGS: Record<string, string> = {
  straightRow: 'Straight rows of keys are easy to guess.',
  keyPattern: 'Short keyboard patterns are easy to guess.',
  simpleRepeat: 'Repeated characters like "aaa" are easy to guess.',
  extendedRepeat: 'Repeated patterns like "abcabcabc" are easy to guess.',
  sequences: 'Sequences like "abc" or "123" are easy to guess.',
  recentYears: 'Recent years are easy to guess.',
  dates: 'Dates are easy to guess.',
  topTen: 'This is one of the ten most used passwords.',
  topHundred: 'This is one of the hundred most used passwords.',
  common: 'This is a commonly used password.',
  similarToCommon: 'This is very close to a commonly used password.',
  wordByItself: 'A single word is easy to guess.',
  namesByThemselves: 'Names on their own are easy to guess.',
  commonNames: 'Common names are easy to guess.',
  userInputs: 'It contains personal or site-related words.',
  pwned: 'This password has appeared in a data breach.',
}

const SUGGESTIONS: Record<string, string> = {
  l33t: "Swapping letters for look-alikes, like @ for a, doesn't add much.",
  reverseWords: 'Common words spelled backwards are still predictable.',
  allUppercase: 'Capitalize some letters, not all of them.',
  capitalization: 'Capitalize more than the first letter.',
  dates: 'Avoid dates and years tied to you.',
  recentYears: 'Avoid recent years.',
  associatedYears: 'Avoid years associated with you.',
  sequences: 'Avoid common character sequences.',
  repeated: 'Avoid repeated words and characters.',
  longerKeyboardPattern: 'Use longer keyboard patterns that change direction.',
  anotherWord: 'Add another, less common word.',
  useWords: 'Use several unrelated words.',
  noNeed: 'Length beats symbols: several random words make a strong password.',
  pwned: 'If you use it anywhere else, change it there too.',
}

function describeSeconds(seconds: number): string {
  if (seconds < 1) return 'instantly'
  const units: Array<[number, string]> = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [100, 'year'],
  ]
  let value = seconds
  for (const [size, name] of units) {
    if (value < size) {
      const rounded = Math.max(1, Math.round(value))
      return `${rounded} ${name}${rounded === 1 ? '' : 's'}`
    }
    value /= size
  }
  return 'centuries'
}

export function estimateStrength(password: string): StrengthEstimate {
  if (!password) return { score: 0, guessesLog10: 0, warning: '', suggestions: [], crackTime: 'instantly' }
  const result = zxcvbn().check(password.slice(0, 256))
  // Offline attacker making 10,000 guesses a second: zxcvbn's slow-hash assumption.
  const seconds = 10 ** result.guessesLog10 / 1e4
  return {
    score: result.score,
    guessesLog10: Math.round(result.guessesLog10 * 10) / 10,
    warning: result.feedback.warning ? (WARNINGS[result.feedback.warning] ?? '') : '',
    suggestions: result.feedback.suggestions.map((key) => SUGGESTIONS[key]).filter(Boolean),
    crackTime: describeSeconds(seconds),
  }
}
