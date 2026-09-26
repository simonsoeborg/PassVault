---
name: PassVault
description: A password vault printed like a security document — plate ink, guilloche linework, denomination inks, and one optically variable control ink.
colors:
  plate: "oklch(0.145 0.014 222)"
  ground: "oklch(0.168 0.015 222)"
  paper: "oklch(0.192 0.016 218)"
  raised: "oklch(0.235 0.018 218)"
  raised-2: "oklch(0.27 0.02 216)"
  sunken: "oklch(0.13 0.013 222)"
  line: "oklch(0.285 0.017 218)"
  line-strong: "oklch(0.375 0.02 216)"
  ink: "oklch(0.94 0.012 170)"
  ink-2: "oklch(0.8 0.016 195)"
  ink-3: "oklch(0.67 0.02 205)"
  underprint: "oklch(0.56 0.045 200)"
  control: "oklch(0.82 0.13 165)"
  control-shift: "oklch(0.8 0.115 205)"
  control-soft: "oklch(0.82 0.13 165 / 0.14)"
  on-control: "oklch(0.18 0.035 190)"
  numbering: "oklch(0.71 0.165 30)"
  numbering-soft: "oklch(0.71 0.165 30 / 0.14)"
  caution: "oklch(0.84 0.125 78)"
  ink-login: "oklch(0.8 0.09 128)"
  ink-ssh: "oklch(0.79 0.095 245)"
  ink-apiKey: "oklch(0.79 0.1 300)"
  ink-note: "oklch(0.81 0.085 70)"
  ink-card: "oklch(0.79 0.1 352)"
  ink-identity: "oklch(0.81 0.06 205)"
  rosette-a: "oklch(0.78 0.03 195)"
  rosette-b: "oklch(0.82 0.13 165)"
  rosette-ring: "oklch(0.56 0.045 200)"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "normal"
  subtitle:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "normal"
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  small:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.08em"
  mono:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
    fontFeature: "no-ligatures, tabular-nums"
  denomination:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.14em"
rounded:
  hairline: "2px"
  plate: "3px"
  pop: "5px"
  window: "8px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.plate}"
    padding: "0 12px"
    height: "30px"
  button-hover:
    backgroundColor: "{colors.raised}"
  button-primary:
    backgroundColor: "{colors.control}"
    textColor: "{colors.on-control}"
    typography: "{typography.body}"
    rounded: "{rounded.plate}"
    padding: "0 12px"
    height: "30px"
  button-primary-hover:
    backgroundColor: "{colors.control-shift}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.plate}"
    padding: "0 12px"
    height: "30px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.numbering}"
    rounded: "{rounded.plate}"
    padding: "0 12px"
    height: "30px"
  input:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.plate}"
    padding: "0 10px"
    height: "32px"
  segmented-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.small}"
    rounded: "{rounded.hairline}"
    padding: "0 10px"
    height: "24px"
  index-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0 10px"
    height: "30px"
  field-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "9px 18px"
  digit-cell:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.hairline}"
    width: "1.35em"
    height: "1.7em"
  keycap:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.plate}"
    padding: "0 5px"
    height: "18px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.hairline}"
    padding: "1px 7px"
  menu-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.hairline}"
    padding: "0 8px"
    height: "26px"
---

# Design System: PassVault

## Overview

**Creative North Star: "The Security Print"**

PassVault is drawn as a security document, not as an app. Its reference material is the passport data page and the banknote: intaglio hairlines instead of card edges, a guilloche rosette that identifies the vault the way a watermark identifies a note, denomination words instead of icon tiles, and a single optically variable ink reserved for the action you are about to take. Every protection the product performs is printed where it can be checked — a sealed field looks sealed, a copy prints its own clearing countdown, an unsaved revision is marked in numbering red.

The default rendition is plate ink: a deep blue-black ground (`plate` / `ground` / `paper`) lit only by hairlines and ink. A second rendition, cotton security paper, is a warm off-white sheet printed in cold intaglio ink; it is not a tint inversion but a second printing of the same plates, and the light sheet carries an actual repeated underprint figure behind the data page because paper has tooth and an ink plate does not. The renderer stamps `data-theme` on `<html>` itself, so the rendition follows the app's own setting rather than the page's media query.

Density is deliberate and unapologetic: 30px index rows, 44px bars, 22px denomination band, a 116px label column. Nothing is a card; nothing floats without cause. The rejected worlds are visible in what is absent — no rounded neutral cards, no favicon avatars, no generic blue primary, and equally no hacker-terminal green-on-black theatre. Measured in the shipped build, every text token clears 5.3:1 against its own ground in both renditions.

**Key Characteristics:**
- Hairline intaglio rules and 3px corners; plates, never cards
- Six denomination inks naming entry types, always as words
- One optically variable control ink, reserved for the next action
- Generative guilloche rosette per vault, real linework, seeded from the vault id
- Sealed underprint bands stand in for every unreleased value
- Fixed digit cells for codes, ports and card numbers, in register

## Colors

Two renditions of one plate: a cold blue-black ink ground by default and a warm cotton sheet in the light rendition, both printed with the same accent inks at adjusted lightness.

### Primary
- **Optically Variable Control Ink** (`control`, emerald): the single saturated accent. It marks only the next action — the primary action button on the data page, the focus ring, the TOTP countdown fill, the active switch, the enter marker in quick search. Under the pointer it shifts toward blue (`control-shift`), the way an OVI patch on a banknote changes angle. `control-soft` is its 14%-alpha wash for focus rings and selected choices.
- **Ink On Control** (`on-control`): the near-black used for text and glyphs sitting on the control ink.

### Secondary
- **Numbering Red** (`numbering`): the register-number ink. It marks copies and their clearing countdown, health problems, unsaved revisions, trashed and destructive actions, and a failed unlock. `numbering-soft` is its wash for danger-button hover and creation warnings.
- **Caution Gold** (`caution`): expiry and favourites only — a value that will go stale, or a star. It never means "primary".

### Tertiary
Six denomination inks, one per entry type, set as `--type-ink` by the `[data-type]` attribute and inherited by the row mark, the guilloche band, the strength readout and the quick-search mark: **Login Olive** (`ink-login`), **SSH Blue** (`ink-ssh`), **API Violet** (`ink-apiKey`), **Note Amber** (`ink-note`), **Card Magenta** (`ink-card`), **Identity Steel** (`ink-identity`).

### Neutral
- **Plate** (`plate`): the rail and the gate — the darkest, most inked surface.
- **Ground** (`ground`): the body and index column.
- **Paper** (`paper`): the data page and settings panel; the sheet you read.
- **Raised / Raised-2** (`raised`, `raised-2`): hover and selected states, menus, dialogs and the generator popover.
- **Sunken** (`sunken`): inputs, digit cells, the machine-readable strip and the foot status lines.
- **Line / Line-Strong** (`line`, `line-strong`): the hairline rule vocabulary — `line` divides fields and rows, `line-strong` outlines buttons, keycaps, popovers and scrollbar thumbs.
- **Ink / Ink-2 / Ink-3** (`ink`, `ink-2`, `ink-3`): the three-step text ramp — values, secondary prose, labels and metadata.
- **Underprint** (`underprint`): the fine-line figure colour of sealed bands and the machine-readable fill.
- **Rosette A / B / Ring** (`rosette-a`, `rosette-b`, `rosette-ring`): the three plates of the vault fingerprint.

### Named Rules

**The One Control Ink Rule.** The control ink marks only what the user acts on next. A passive readout never wears it: the password strength meter prints in the entry's own denomination ink (or `ink-2` at the gate, where no entry exists), and never in emerald, because strength is a quality reading and not a button.

**The Numbering Red Rule.** Red is the register ink, not an error colour in general. It is spent on four things only: a copy in flight and its clearing countdown, a health problem, an unsaved or restorable revision, and a destructive action.

**The Denomination Word Rule.** An entry type is named by its word (LOGIN, SSH, API, NOTE, CARD, ID) in its own ink, in mono, letterspaced. Type is never carried by an icon tile, a coloured dot, a favicon or an avatar.

## Typography

**Display Font:** Atkinson Hyperlegible Next (self-hosted, weights 400/500/600/700)
**Body Font:** Atkinson Hyperlegible Next
**Label/Mono Font:** Atkinson Hyperlegible Mono (self-hosted, weights 400/500)

**Character:** A legibility-first pairing chosen for the same reason a passport is set in a distinguishable face: the glyphs that get confused when someone retypes a secret — 0/O, 1/l/I, 5/S — are drawn apart. Tabular figures are on globally, and mono ligatures are switched off. The tone is plain, documentary and unstyled; the drama comes from the linework, never from the type.

### Hierarchy
- **Display** (600, 26px, 1.1, -0.01em): the vault name at unlock and the welcome title, the only two places anything is set this large.
- **Headline** (600, 20px, 1.25, -0.01em): the entry title on the data page, the editor's title input, the empty-pane heading, imported figures.
- **Title** (600, 16px): dialog headings, locked quick-search heading, import confirmation.
- **Subtitle** (600, 14px): panel and index column titles, rail vault name, offer titles, input text.
- **Body** (400, 13px, 1.45): the default — field values, index row titles, menu items, buttons.
- **Small** (400, 12px, 1.5): supporting prose, hints, sub-labels, breadcrumbs, row subtitles.
- **Label** (600, 11px, 0.08em, uppercase): the `caps` class — field labels, rail section labels, section headings, the machine-readable strip's hint. This is the data-page label voice.
- **Mono** (400, 13px): secrets, hosts, usernames, ports, codes, commands, serials, dates and revision numbers.
- **Denomination** (500, 10px, 0.14em, mono): the type word on the guilloche band; 9.5px at 0.06em in rail and index rows.

### Named Rules

**The Mono Is Evidence Rule.** Mono is reserved for what the user retypes, transcribes or runs: secrets, hosts, ports, codes, commands, serials and dates. Prose is never mono. Row subtitles for notes and identities switch back to the UI face precisely because they carry words, not machine values.

**The Secret Never Wraps Rule.** A revealed secret is a single non-wrapping line that scrolls horizontally, masked to transparent over the last 20px of its box. A line break inside a hyphenated secret is ambiguous to whoever is retyping it, and a clipped value must never be able to look like a whole one. Long transcription goes to the numbered large-type dialog instead.

## Layout

Three plates in one CSS grid: rail (`--rail`, 232px), index (`--index`, 392px) and a data page taking the remainder. The rail is the darkest plate, the index the ground, the page the sheet — the vertical hairlines between them are the only separators. Bars are a fixed 44px (`--bar`) and act as the window drag region; under `[data-platform='win32']` and `[data-platform='linux']` the page and panel bars take 150px of right padding to clear the native window controls.

Structural breakpoints are in the tokens, not in component queries: at **1180px** the index narrows to 340px; at **1000px** the rail goes to 196px, the index to 304px and the field label column to 96px. Nothing reflows into a single column — this is a desktop document.

Spacing runs on a 4px rhythm (4 / 8 / 12 / 16 / 24 / 32 / 48). The data page has one horizontal margin, 18px, shared by band, header, fields, sections, machine-readable strip and foot, so every element in the sheet stands on one left edge. Row heights are fixed and dense: 30px index rows, 26px rail rows and menu items, 40px quick-search rows, 9px vertical padding in a field row. Reading measures are capped where prose appears: 72ch for notes and multiline values, 76ch for settings groups, 52-62ch for hints.

**The Register Rule.** Every entry type, the editor, and the revision compare use the same field grid: a `--label-col` (116px) label column, a flexible value column, and an auto action column. A long grouped number wraps by whole group so every row of it starts on the same left edge. Values of the same kind always appear in the same place on the sheet.

## Elevation & Depth

This is a printing system, not a stack of floating panes. Depth comes from ink weight and hairlines: `plate` → `ground` → `paper` reads as three plates of a document, and hover and selection are tonal steps (`raised`, `raised-2`) rather than lifts. Shadows exist for exactly one reason — something has genuinely left the sheet and is floating above it — and there is a single shadow token for it.

### Shadow Vocabulary
- **Pop** (`--shadow-pop`: `0 18px 40px -12px oklch(0.04 0.01 220 / 0.75), 0 3px 10px -2px oklch(0.04 0.01 220 / 0.55)`; softened and cooled in the light rendition): context menus, dialogs and the generator popover, the only three things that detach.
- **Knockout halo** (`box-shadow: 0 0 0 3px var(--paper)`): not depth at all — a 3px paper-coloured ring that knocks the denomination word and serial out of the guilloche linework, the way a figure is printed clear on a banknote.
- **Focus wash** (`box-shadow: 0 0 0 3px var(--control-soft)`): the focus state of inputs and the search field; `numbering-soft` on an invalid field.

### Named Rules

**The Flat Sheet Rule.** Surfaces on the sheet never carry a shadow. If an element needs `--shadow-pop`, it must be genuinely overlaid (menu, dialog, popover) and positioned `fixed`. Status strips print across the foot of the sheet as full-width bands, not as floating toasts.

## Shapes

Corners are almost square: 3px (`--r-1`) for buttons, inputs, choices and rail rows; 2px for inner details like digit cells, tags, segmented options and menu items; 5px (`--r-2`) for the three overlay surfaces; 8px only for the quick-search window, which is a physically separate window. Circles exist twice only: the switch knob and the 5px health dot.

The recurring geometry is linework. The guilloche figure appears at four scales: the per-vault rosette (three SVG layers of generated epitrochoid linework, seeded deterministically from the vault id via FNV-1a, ~2600 sampled steps at full size and a simplified low-lobe variant below 120px, since dense interlace fills to a solid disc when printed small); the 22px denomination band across the top of the data page, masked from a repeating 48×22 figure in the type's ink and faded out before the right edge so it never clips a figure mid-stroke; the 18×12 sealed band; and the full-sheet underprint in the light rendition. All of it is generated or masked linework — never an image asset, never a gradient standing in for a pattern.

## Components

### Buttons
- **Shape:** near-square (3px), 30px tall, 12px horizontal padding; 24px `sm`, 40px `lg`, square 30px icon variant.
- **Default:** transparent with a `line-strong` hairline border and full-strength ink; hover fills `raised`, active `raised-2`.
- **Primary:** control ink ground, `on-control` text, 600 weight, no border. Hover shifts the ground to `control-shift`; active additionally dims to 92% brightness. One per surface — the entry's primary action (Copy password / Connect / Copy secret), the dialog's confirm, the gate's Unlock.
- **Quiet:** borderless, `ink-2` text, hover raises to full ink on `raised` — used for bar actions and dismissals.
- **Danger:** numbering-red text with a 50%-alpha red hairline; hover fills `numbering-soft`.
- **Busy:** a 2px sweeping bar animates across the bottom inside edge (1.1s, ease-out) instead of a spinner.
- **Icons:** 15px stroked SVG at 1.75 stroke width, inline in the label.

### Inputs / Fields
- **Style:** `sunken` ground, `line` hairline, 3px corners, 32px tall (40px `lg`, 24px inline); textareas from 92px with vertical resize; selects draw their own 5px chevron from two gradients.
- **Focus:** border becomes control ink plus a 3px `control-soft` wash. Invalid swaps both to numbering red.
- **Search field:** a 28px hairline box that takes the same focus treatment on `:focus-within`, with a ⌘K keycap at its right.
- **Title input:** chromeless, 20px/600, underlined by a single hairline that turns control ink on focus.

### Chips
- **Tag:** 11px text, `line-strong` hairline, 2px corners, no fill.
- **Row flag:** 9px letterspaced mark (2FA and similar) in `ink-3` with a hairline box.
- **Flag word:** 9px mono in numbering red inside a 45%-alpha red hairline — the health and caution marks on the data page; `caution`-tinted for expiry.

### Navigation (rail)
- 26px rows, 3px corners, `ink-2` text at 13px/500; hover `raised`, current `raised-2` with full ink; a drop target takes a `control-soft` fill and inset control outline. Type views carry their 32px denomination word; counts sit right in `ink-3`, and a count that reports a problem turns numbering red. The foot holds the sync line and Lock above a hairline.

### Index rows
- A four-column 30px grid (38px mark / title / right-aligned mono subtitle / flags) with `content-visibility: auto` for long lists. The mark is the type word in its ink; the subtitle carries the host or username in mono; trashed rows strike through in `ink-3`. Selection is a `raised-2` fill, and only keyboard focus adds an inset control-ink outline.

### The vault rosette (signature)
Deterministic generative guilloche from the vault id, three stacked layers — ring, layer B in control-ink hue, layer A in cool steel. It appears at 132px on the gate and empty pane and as a small badge in the rail. While locked or deriving, layers A and B sit deliberately out of register (-4° and +9°/0.965 scale); on unlock they rotate into register over 460ms on `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`). Deriving breathes on a 1.8s loop; a wrong password knocks the layers further out of register for 400ms and returns them.

### App icon
The icon is the rosette the app prints for itself: `rosetteFor('passvault')`, the fallback seed, drawn in register on a `plate` squircle with one `line-strong` hairline frame. Layer B is the only place the control ink is printed as a true optically variable shift, `control` to `control-shift` across the plate. Below 200px of plate it switches to the rosette's small format, as the rail badge does. Regenerate with `npm run icons` (`scripts/icons.mjs`); never edit the PNGs by hand.
### Sealed band and digit cells (signature)
A `sealed` band — 172px × 12px of fine-line guilloche masked in `underprint` — stands for any value the vault has not released, with an accessible label instead of bullet glyphs. Fixed digit cells (`1.35em` × `1.7em`, `sunken`, 2px corners, mono) carry TOTP codes, ports, card numbers and expiry dates so digits swap in place; grouped numbers wrap by whole group. A TOTP adds a 2px countdown track filled in control ink, turning numbering red in its last five seconds.

### Machine-readable strip (signature)
The SSH command printed full-width on a `sunken` band above a hairline, in mono, followed by a `<<<<` filler run in `underprint` at 45% opacity and a COPY hint — the MRZ line of the data page. The whole strip is the copy button.

### Status strips
Copy receipt and notice print as fixed 30px bands across the foot of the sheet, starting at the rail's right edge so the rail's own sync line stays readable, entering with a 180ms 6px rise. The receipt's clearing countdown is mono in numbering red; when both show, the notice stacks above the receipt.

### Menus and dialogs
5px corners, `raised` ground, `line-strong` hairline, `--shadow-pop`. Menu items are 26px with 2px corners, hover and focus on `raised-2`, mono hints in `ink-3`, danger items in numbering red; a disabled item is reused as an uppercase 11px section label. Dialogs cap at 420px (880px for large type) over a 55%-alpha ink backdrop.

## Do's and Don'ts

### Do:
- **Do** set `data-type` on any element representing an entry and let `--type-ink` cascade; never hard-code one of the six denomination inks.
- **Do** name entry types with their word (LOGIN, SSH, API, NOTE, CARD, ID) in mono, letterspaced, in the type's ink.
- **Do** keep exactly one control-ink element per surface, and make it the action the user will take next.
- **Do** put every value, in every entry type and in the editor and the revision compare, on the shared `--label-col` field grid.
- **Do** reach for a `sealed` band whenever a value exists but has not been released to the renderer.
- **Do** set codes, ports, card numbers and expiries in fixed digit cells, grouped so a long number wraps by whole group.
- **Do** divide with hairlines (`line`, `line-strong`) and separate with tonal steps (`raised`, `raised-2`).
- **Do** keep state feedback at 150-200ms (`--fast`, `--med`) and leave the 460ms rosette registration as the only authored moment; respect the `prefers-reduced-motion` block that collapses all of it to 1ms.
- **Do** draw new pattern work as generated or masked linework in ink tokens, at the same guilloche family as the rosette and band.

### Don't:
- **Don't** put the control ink on a passive readout — strength, counts, progress of something the user is not about to act on.
- **Don't** spend numbering red on anything but copies, health problems, unsaved or restorable revisions, and destructive actions; expiry is `caution`.
- **Don't** build cards: no filled, rounded, shadowed containers on the sheet. Sections are hairline-ruled plate regions (`.offer` is the pattern).
- **Don't** add a shadow to anything that has not genuinely detached from the sheet; `--shadow-pop` belongs to menus, dialogs and popovers only.
- **Don't** substitute an icon, dot, favicon or avatar where a word does the structural work.
- **Don't** let a revealed secret wrap, and don't remove the right-edge fade that proves a value is cut off.
- **Don't** exceed 5px corners on anything inside a window (8px is reserved for the quick-search window itself).
- **Don't** branch the rendition on `prefers-color-scheme`; read `:root[data-theme='light']`, because the renderer owns the theme stamp.
- **Don't** introduce a second accent hue or a generic blue primary; the control ink and the six denomination inks are the whole accent vocabulary.
