> Global kurallar: ~/CLAUDE.md (token, guvenlik, kodlama standartlari)

# CLAUDE.md — Owlivion Mail

## Project Identity
- **Name:** Owlivion Mail
- **Type:** Secure Desktop Email Client (Tauri v2).
- **Core:** Privacy-focused, AI Phishing Detection (Gemini), Tracking Pixel Blocker.
- **Security:** Local storage (AES-256-GCM), Zeroize memory wiping.

## Tech Stack
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS.
- **Backend:** Rust (Tauri v2), SQLite (rusqlite), async-imap/smtp.
- **Crypto:** Ring library, HKDF key derivation.

## Self-Hosted Home Server (Security)
- **Goal:** All backend features run on the self-hosted home server, not the cloud.
- **Host:** `100.88.12.69` (override via `VITE_HOME_SERVER_HOST`).
- **Config:** Central base URLs in `src/config/homeServer.ts` (env-overridable).
- **Account Sync:** `owlivion-sync-server` on `:3300` (was `sync.owlivion.com` / VPS 31.97.216.36).
  - Rust client base URL: `OWLIVION_SYNC_URL` env, defaults to home (`src-tauri/src/sync/api.rs`).
- **AI:** `owlivion-home-ai/` bridge on `:11500` — Ollama-compatible API backed by
  Claude Code (subscription auth). Default AI provider is now this bridge.
- **Note:** Gmail/Outlook OAuth still goes to Google/Microsoft (mailboxes live there).
- **Data:** Account settings, Contacts, Preferences, Signatures — encrypted server-side.

## File Structure Map
- `/src`: React Frontend (UI, Components, Services).
- `/src-tauri`: Rust Backend.
  - `/db`: SQLite operations.
  - `/mail`: IMAP/SMTP handling.
  - `/crypto.rs`: Encryption logic.
- `/landing`: Website assets.

## Development Commands
- **Run Dev:** `pnpm tauri dev`
- **Build:** `pnpm tauri build`
- **Test:** `cd src-tauri && cargo test`

## Coding Rules
1. **Language:** Answer in **Turkish**. Comments/variables in English.
2. **Security:** Never expose secrets. Use `Zeroize` for sensitive memory.
3. **UI/UX:** Maintain Dark/Light theme compatibility.
4. **Sync Logic:** Future sync implementation must prioritize end-to-end encryption before sending to VPS.
  
  

