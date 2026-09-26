import { randomInt } from 'node:crypto'
import type { GeneratedSecret, GeneratorOptions } from '../shared/types'
import { WORDLIST } from './wordlist'

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SYMBOLS = '!#$%&*+-.:;=?@^_~'
const AMBIGUOUS = new Set('Il1O0o|`\'"')

export const DEFAULT_GENERATOR: GeneratorOptions = {
  mode: 'characters',
  length: 24,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
  words: 5,
  separator: '-',
  capitalize: false,
  includeNumber: false,
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

function clean(alphabet: string, avoidAmbiguous: boolean): string {
  return avoidAmbiguous ? [...alphabet].filter((c) => !AMBIGUOUS.has(c)).join('') : alphabet
}

export function generateSecret(options: GeneratorOptions): GeneratedSecret {
  return options.mode === 'passphrase' ? generatePassphrase(options) : generateCharacters(options)
}

function generateCharacters(options: GeneratorOptions): GeneratedSecret {
  const length = Math.min(128, Math.max(8, Math.floor(options.length)))
  const classes = [
    options.upper && clean(UPPER, options.avoidAmbiguous),
    options.lower && clean(LOWER, options.avoidAmbiguous),
    options.digits && clean(DIGITS, options.avoidAmbiguous),
    options.symbols && clean(SYMBOLS, options.avoidAmbiguous),
  ].filter((c): c is string => Boolean(c))
  if (classes.length === 0) classes.push(clean(LOWER, options.avoidAmbiguous))
  const alphabet = classes.join('')

  // One character from every chosen class, the rest from the full alphabet, then shuffled.
  const chars = classes.map(pick)
  while (chars.length < length) chars.push(pick(alphabet))
  const value = shuffle(chars).join('')
  return { value, entropyBits: Math.floor(length * Math.log2(alphabet.length)) }
}

function generatePassphrase(options: GeneratorOptions): GeneratedSecret {
  const count = Math.min(12, Math.max(3, Math.floor(options.words)))
  const words: string[] = []
  for (let i = 0; i < count; i++) {
    const word = WORDLIST[randomInt(WORDLIST.length)]
    words.push(options.capitalize ? word[0].toUpperCase() + word.slice(1) : word)
  }
  let entropy = count * Math.log2(WORDLIST.length)
  if (options.includeNumber) {
    const position = randomInt(count)
    words[position] = `${words[position]}${randomInt(10)}`
    entropy += Math.log2(10) + Math.log2(count)
  }
  const separator = options.separator.slice(0, 3)
  return { value: words.join(separator), entropyBits: Math.floor(entropy) }
}
