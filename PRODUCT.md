# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Desktop app: an Electron shell with a React UI on macOS, Windows and Linux. The design language is desktop, rendered with web tech.)

## Stack

Electron + React + Node (named by the user). Delegated details: TypeScript throughout, electron-vite for build and dev, electron-builder for packaging.

## Users

Technical people: developers and sysadmins who manage many accounts, credentials and servers. They switch between machines and OSes, work mostly from the keyboard, and prefer dense, fast interfaces to guided ones.

## Product Purpose

A local-first, cross-platform password vault in the spirit of KeePass. It stores credentials and connection details in one strongly encrypted vault file that the user owns. Success means the user trusts the vault with everything, can find and use any entry in seconds, and can open the same vault on every machine they use.

## Positioning

A KeePass-style vault built for how technical users actually work: SSH hosts sit next to passwords as their own entry type, and the vault is one file in the user's own synced folder. No account, no vendor cloud, no server to trust.

## Operating Context

- Used all day next to a terminal, an IDE and a browser, often with several windows open.
- Opened on several machines. The vault file lives in a folder the user already syncs (iCloud Drive, Dropbox, OneDrive, Syncthing). The app watches for outside changes and merges them.
- Unlocked many times a day. Biometric unlock keeps that fast; the master password is the fallback and the root.

## Capabilities and Constraints

- **Vault file:** its own format, Argon2id key derivation with XChaCha20-Poly1305 authenticated encryption. One file per vault.
- **Import:** one-way import from KeePass (KDBX).
- **Sync:** by file only. The app detects outside modification and merges changes without silently losing data. No built-in sync server.
- **Master password:** required for every vault. It is the root secret.
- **Biometrics:** optional unlock via the OS (Touch ID on macOS, Windows Hello fingerprint or face on Windows, fprintd fingerprint on Linux where available). Availability depends on the hardware and OS. Biometrics never replace the master password.
- **Organization:** user-created folders, nestable, holding entries.
- **Entry types:** password entries and SSH entries at minimum. The rest of the set is still open.
- **Security posture:** protecting the database is the top priority. No plaintext secrets on disk, no telemetry, no remote content.
- **Working name:** "PassVault", taken from the project folder. Not confirmed as final.

## Evidence on Hand

None yet. There are no real users, audits, certifications or benchmarks. Future work must not claim an audit, compliance or cryptographic guarantees beyond what is actually implemented. Demo vault content must be labeled as sample data.

## Product Principles

1. **The master password is the root of trust.** Biometrics and remembered unlocks are revocable shortcuts on top of it, never replacements.
2. **Your file, your folder.** The vault is a single encrypted file the user controls. Sync belongs to their tools, and merges never drop data silently.
3. **Secrets stay sealed until asked for.** Decrypted values appear only on explicit reveal or copy, and they expire from screen and clipboard.
4. **Seconds, not clicks.** Finding an entry and using it (copy, connect) should work from the keyboard in one motion.
5. **Honest security.** Show what is protected and how, in plain terms. No theatre, no unearned claims.
