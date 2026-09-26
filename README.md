# PassVault

A local-first password and SSH vault for macOS, Windows and Linux. One encrypted
file holds your logins, servers, keys, notes, cards and identities. You keep the
file; a folder you already sync carries it between your machines.

Built with Electron, React and TypeScript. No account, no server, no telemetry.

---

## Running it

```bash
npm install
npm run dev
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Electron with hot reload |
| `npm test` | Unit tests: crypto, file format, merge, TOTP, SSH argument building, KeePass 1 and 2 import, Twofish vectors |
| `npm run build` | Bundles main, preload and renderer into `out/` |
| `npm run smoke` | Launches the built app and drives a real vault through create → edit → lock → reopen → KeePass 1 and 2 import (24 checks) |
| `npm run typecheck` | Type-checks main/preload and renderer separately |
| `npm run web:mock` | Opens the interface in a browser against synthetic data, for design work |
| `npm run capture` | Screenshots the built app's windows into `.impeccable/review/` |
| `npm run dist` | Packages installers into `dist/` (`dist:mac`, `dist:win`, `dist:linux`) |

macOS note: Touch ID is only offered to a code-signed app. Set
`CSC_IDENTITY_AUTO_DISCOVERY=true` (or sign the built app yourself) or biometric
unlock will be refused by the system.

---

## The vault file

One file, `.pvault`, encrypted as a whole. Nothing about it is readable without
your master password — not entry titles, not URLs, not the number of entries.

```
offset  size   field
0       4      magic "PVLT"
4       2      format version (1)
6       16     vault id
22      1      KDF id (1 = Argon2id)
23      4      memory in KiB
27      4      iterations
31      1      parallelism
32      32     salt
64      1      cipher id (1 = XChaCha20-Poly1305)
65      24     nonce, fresh on every save
89      32     HMAC-SHA256(headerKey, bytes 0..89)
121     n+16   ciphertext and tag; associated data = bytes 0..121
```

* **Key derivation** — Argon2id over the NFC-normalised master password.
  Standard is 128 MiB and 3 passes; Strong is 512 MiB and 4 passes. The root key
  is split with HKDF-SHA256 into a body key and a header-authentication key.
* **Body** — a `u32` length, UTF-8 JSON, then zero padding to the next 4 KiB, so
  the file size only reveals a coarse bucket.
* **Header authentication** — checked before decryption, which is how a wrong
  password ("that password does not open this vault") is told apart from a
  damaged file ("the password is right, but the contents are damaged").
* **Bounds** — key-derivation parameters read from a file are range-checked
  before use, so a hostile header cannot make the app allocate gigabytes.

Crypto comes from audited, widely used implementations: `@noble/ciphers` for
XChaCha20-Poly1305, `@noble/hashes` for HKDF/HMAC/SHA-2, and `hash-wasm` for
Argon2id. The unit tests check Argon2id against a second independent
implementation, and TOTP against the RFC 6238 vectors.

---

## Sharing one vault between your machines

Put the file in iCloud Drive, Dropbox, OneDrive, Syncthing, Nextcloud — anything
that syncs folders. PassVault detects the file changing underneath it and
**merges** instead of overwriting:

* entries and folders are matched by id, and the newer edit wins;
* when both sides changed the same entry since the last sync, the losing version
  is kept in that entry's history rather than dropped;
* deletions travel as tombstones, but an edit newer than the deletion wins;
* every save is atomic (write to a temp file, fsync, rename) and retries while a
  sync client holds the file open;
* if a save fails outright, the encrypted vault is written to a recovery copy in
  the app's data folder instead of being lost.

If the master password was changed on another device, the app locks and says so
rather than silently failing to save.

---

## Entry types

| Type | Holds | Primary action |
| --- | --- | --- |
| Login | username, password, website, TOTP | Copy password |
| SSH | host, port, user, private key or password, jump host | Connect |
| API key | key id, secret, environment, endpoint, expiry | Copy secret |
| Secure note | sealed body | Copy note |
| Card | cardholder, number, expiry, security code, PIN | Copy number |
| Identity | name, contact details, document number and expiry | Copy document no. |

Entries live in nestable folders, can be starred, tagged, trashed and restored,
and keep up to 20 past versions each. Every type also takes custom fields, which
can be sealed individually.

**Health** flags weak passwords (zxcvbn), passwords reused inside the vault,
logins untouched for a year, and anything expiring within the month.

---

## SSH

`Connect` builds the command, loads the key and opens your terminal:

* host, port, user and jump hosts are validated against a strict character set,
  so nothing typed into an entry can become an ssh option (`-oProxyCommand=…`)
  or shell syntax;
* private keys are handed to the running agent over stdin
  (`ssh-add -t <lifetime> -`) and never written to disk — encrypted keys are
  decrypted in-process with their stored passphrase;
* password entries copy the password to the clipboard (with its countdown) and
  then open the session;
* terminals: Terminal, iTerm, Ghostty, WezTerm on macOS; Windows Terminal or
  Command Prompt on Windows; GNOME Terminal, Konsole, kitty, Alacritty, foot,
  xterm and others on Linux.

---

## Importing from KeePass

`Import from KeePass…` reads both KeePass formats and copies the contents in.
The original file is never modified. The format is decided by the file's bytes,
not its name, so a renamed database still imports.

* **`.kdbx`** — KeePass 2, format 3.1 and 4, password and/or key file.
* **`.kdb`** — KeePass 1, AES-256 or Twofish-256, password and/or key file.

Both formats go through the same field rules:

* groups become folders; the KeePass 2 recycle bin lands in Trash;
* `ssh://` URLs and attached OpenSSH/PEM private keys become SSH entries;
* TOTP arrives from all three conventions in the wild — KeePassXC's `otp`,
  KeePass 2.47's `TimeOtp-*`, and the legacy `TOTP Seed` plugin fields;
* protected custom fields stay sealed; PuTTY `.ppk` attachments are kept as
  sealed fields, since only OpenSSH and PEM keys can be loaded into an agent;
* attachments that are not private keys stay in the original file, and the
  import report counts them rather than dropping them quietly.

What differs for KeePass 1, because the format itself differs:

* it has no recycle bin. KeePass 1 keeps old copies of entries in a group named
  `Backup`, which imports as an ordinary folder — nothing is auto-trashed on the
  strength of a group's name.
* it has no per-entry history, no tags and no custom fields, so those arrive empty.
* it cannot tell a wrong password from a damaged file: both fail the same
  integrity check, and the error says so rather than guessing.
* KeePass 1 hashed the master password in the Windows code page. A database made
  on Windows with a non-ASCII password is tried as Windows-1252, then Latin-1,
  then UTF-8.

The KeePass 1 reader is implemented here, in `src/main/import/kdb/`, following
KeePassXC's `KeePass1Reader`. It is tested against databases KeePass itself
wrote — including AES and Twofish files, all three key-file shapes, a composite
password-plus-key-file database and a Windows-1252 password — which live in
`tests/fixtures/keepass1/` and come from KeePassXC's own test suite.

---

## Unlocking

The master password is always the root of trust. Biometrics are a shortcut on
top of it:

| OS | Mechanism |
| --- | --- |
| macOS | Touch ID (`LocalAuthentication` through Electron) |
| Windows | Windows Hello (`UserConsentVerifier` via Windows PowerShell) |
| Linux | fprintd, when a finger is enrolled and a keyring is available |

Turning it on asks for the master password once, then hands the vault key to the
OS keystore (Keychain, DPAPI, libsecret) — or keeps it in memory only until
PassVault quits, if you prefer. Either way it expires (weekly by default) and
the master password is required again. The key never travels with the vault
file, so it protects this device only.

---

## Keyboard

| Keys | Action |
| --- | --- |
| `⌘/Ctrl+Shift+Space` | Quick search over any app |
| `⌘/Ctrl+K` | Search the vault |
| `⌘/Ctrl+N` | New entry |
| `⌘/Ctrl+E` | Edit the selected entry |
| `⌘/Ctrl+L` | Lock |
| `↵` | Copy the selected entry's secret, or connect |
| `⌘/Ctrl+↵` | Copy the ssh command, or the one-time code |
| `⌘/Ctrl+Shift+C` | Copy username |
| `Delete` | Move to Trash (with undo) |

---

## What protects the vault, and what does not

Protections: whole-file authenticated encryption; Argon2id key stretching;
secrets withheld from the interface process until you reveal or copy them;
revealed values re-sealing after 30 seconds; clipboard copies clearing on a timer
(only if the clipboard still holds what PassVault put there); auto-lock on idle,
sleep and screen lock; windows hidden from screen capture; the renderer sandboxed
with no Node access, a `default-src 'none'` CSP, no network access at all, and
every IPC call checked for a trusted sender.

Honest limits, also printed in the app under **Vault security**:

* malware running as you while the vault is unlocked can read what the app reads;
* clipboard managers and Windows clipboard history may keep their own copies;
* JavaScript cannot guarantee wiping a secret from memory, which is why the app
  locks when idle and reloads its windows on lock;
* Argon2id makes guessing a weak master password expensive, not impossible;
* a forgotten master password means the vault is gone. There is no backdoor.

No third party has audited this code.

---

## Layout

```
src/main/         vault session, file format, crypto, merge, IPC, windows, OS bridges
src/preload/      the one bridge the renderer gets
src/renderer/     React interface (and a synthetic-data mock for design work)
src/shared/       types and the IPC contract
tests/            unit tests
scripts/smoke.mjs end-to-end test inside Electron
```

Design decisions for the interface live in `DESIGN.md`; product decisions in
`PRODUCT.md`.

---

## Credits

Passphrases use the [EFF long wordlist](https://www.eff.org/dice) (CC BY 3.0 US).
KeePass 2 files are read with `kdbxweb`; the KeePass 1 reader is our own, written
against the format as implemented by KeePassXC's `KeePass1Reader`, with its AES
from `@noble/ciphers` and a Twofish implementation checked against 303 published
test vectors. SSH keys are parsed with `sshpk`, password strength estimated with
`zxcvbn-ts`. Interface type is Atkinson Hyperlegible
Next and Mono, whose letterforms are hard to confuse — which matters when you
are reading a password off a screen.
