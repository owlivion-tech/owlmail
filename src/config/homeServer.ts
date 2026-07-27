// ============================================================================
// OwlMail - Home Server Configuration
// ============================================================================
// All previously-cloud features are relocated to a self-hosted home server
// for security. Base URLs default to the home server but can be overridden at
// build time via Vite env vars (see .env.example), so nothing is hardcoded to
// an external service.
//
//   VITE_HOME_SERVER_HOST  → base host of the home server (default 100.88.12.69)
//   VITE_SYNC_SERVER_URL   → Account Sync backend (owlivion-sync-server)
//   VITE_HOME_AI_URL       → Home AI bridge (Ollama-compatible, Claude Code)
// ============================================================================

const HOME_HOST =
  (import.meta.env.VITE_HOME_SERVER_HOST as string | undefined) || '100.88.12.69';

/** Account Sync backend (owlivion-sync-server). Listens on :3300 by default. */
export const SYNC_SERVER_URL =
  (import.meta.env.VITE_SYNC_SERVER_URL as string | undefined) ||
  `http://${HOME_HOST}:3300`;

/** Sync REST API base (adds the versioned prefix used by the client). */
export const SYNC_API_BASE_URL = `${SYNC_SERVER_URL}/api/v1`;

/**
 * Home AI bridge — an Ollama-compatible endpoint served on the home server
 * that proxies requests to Claude Code (subscription auth). Because it speaks
 * the Ollama API, the existing Ollama transport is reused unchanged.
 */
export const HOME_AI_URL =
  (import.meta.env.VITE_HOME_AI_URL as string | undefined) ||
  `http://${HOME_HOST}:11500`;

/** Default model the home AI bridge maps onto Claude Code. */
export const HOME_AI_DEFAULT_MODEL = 'sonnet';
