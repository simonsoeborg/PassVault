---
version: 1
slug: "src-renderer-src-app-tsx"
primary_target: "src/renderer/src/App.tsx"
related_targets: ["src/renderer/src/quick/QuickApp.tsx"]
---

# Vault app surface (main window + quick search)

## Scope and mode

Operate. The desktop app's unlocked vault window is the primary surface. It shares one world with the lock and create flows, settings, and the global quick-search window.

## Audience, job, constraints

- Technical users. They unlock many times a day, find an entry by typing, and copy or connect in one keystroke.
- Entry types: login (with TOTP), SSH, API key, secure note, card, identity. Entries live in nested folders.
- Secrets never reach the renderer until the user reveals or copies them. Copies expire from the clipboard.
- Master password is always required; biometrics are optional on top.
- Must not feel like consumer softness: no bubbly friendliness, no onboarding theatre, no avatars.

## Direction contract

THESIS: The vault is a security document, and each protection is printed where you can see and check it: the vault's own fingerprint, sealed fields, copies that expire, and save revisions. It refuses the category default (three panes of rounded neutral cards, favicon avatars, a blue button) and its hacker-terminal opposite.

OWN-WORLD: Primary rendition is a plate-ink ground (deep blue-black). A light cotton security-paper rendition follows the OS. Hairline intaglio rules, 3px corners, no cards and no avatars. Each vault gets a generative guilloche rosette seeded from its id. Secret values sit under a fine-line underprint band until revealed. Entry types are marked by six denomination inks, always as words (LOGIN, SSH, API, NOTE, CARD, ID). One OVI control ink (emerald shifting toward blue on hover) appears only on the next action. Numbering red marks copies, unsaved revisions, health problems and destructive actions. Atkinson Hyperlegible Next for the UI; Atkinson Hyperlegible Mono only for secrets, hosts, codes and commands.

STORY: The user unlocks with a fingerprint or the master password and recognizes the rosette as their vault. They type a few letters and use the entry in one keystroke. They trust it because sealed fields visibly look sealed, and every copy prints its own clearing countdown.

FIRST VIEWPORT: Unlocked window at 1280×800. Left rail, 232px: small rosette, vault name and ID code, then views (All, Favorites, six type views), the folder tree, Health counts in numbering red, Trash, and at the foot a sync line plus Lock. Index column, 360px: search field (⌘K) and New, then dense 36px rows showing title, a mono subtitle and the type word in its ink. Data page fills the rest: an 8px guilloche band in the type's ink, type and folder path, a 20px title, and the primary action as the single control-ink button at the header's right (Copy password / Connect / Copy secret). Below that, a registered field grid (104px label column), sealed bands on secrets, and TOTP in fixed digit cells with a countdown hairline. SSH entries end in a machine-readable strip carrying the ssh command.

FORM: Security Print (passport data pages and banknote security printing), position 4 of 7 on the ordered list; seed key 07ebf395.
- Raise from Nixie Counter: TOTP codes, ports and card numbers sit in fixed digit cells and swap in place.
- Raise from Botanical Folio: every entry type shares one registered field grid, and version history compares in register.
- Raise from Convention Catalog: density courage, 30+ index rows at a glance, rows not cards.
- Raise from Alphabet Storm: type does the structural work; no icon tiles where a word belongs.
- Raise from Drawcord Cape: the accent is the control; the one saturated ink marks only what you act on next.
- Signature interaction: registration. On unlock the rosette's two offset layers rotate into register (about 420ms, exponential ease-out) and the vault opens; a wrong password knocks them out of register. Everything else moves only to show state, in 150–200ms.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Final product name ("PassVault" is the working name).
- App icon artwork.
