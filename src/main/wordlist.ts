// EFF large wordlist for dice-generated passphrases (7,776 words, 12.9 bits each).
// Word list © Electronic Frontier Foundation, CC BY 3.0 US: https://www.eff.org/dice
import diceware from 'diceware-wordlist-en-eff'

export const WORDLIST: readonly string[] = Object.freeze(Object.values(diceware as Record<string, string>))
