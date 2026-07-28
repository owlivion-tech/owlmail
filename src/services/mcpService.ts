// ============================================================================
// OwlMail MCP Client — JSON-RPC 2.0 over HTTP
// ============================================================================
// Connects to the self-hosted Home AI bridge (/mcp endpoint).
// Wraps tool calls into typed async functions used by aiService.ts.

import { HOME_AI_URL, HOME_AI_TOKEN } from '../config/homeServer';
import type { PhishingAnalysis } from './geminiService';

const MCP_URL = `${HOME_AI_URL}/mcp`;
let _id = 1;

interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}

function authHeaders(): Record<string, string> {
  return HOME_AI_TOKEN ? { 'Authorization': `Bearer ${HOME_AI_TOKEN}` } : {};
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const id = _id++;
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);

  const result = data.result as McpToolResult;
  if (result.isError) throw new Error(result.content.find(c => c.type === 'text')?.text || 'MCP tool error');
  return result.content.find(c => c.type === 'text')?.text || '';
}

// ─── Public helpers ──────────────────────────────────────────────────────────

export async function summarizeEmail(content: string, language: 'tr' | 'en'): Promise<string> {
  return callTool('summarize_email', { content, language });
}

export async function generateReply(
  emailContent: string,
  tone: string,
  senderName: string,
  language: 'tr' | 'en',
  emailSubject?: string,
): Promise<string> {
  return callTool('generate_reply', { emailContent, tone, senderName, language, emailSubject: emailSubject || '' });
}

export async function analyzePhishing(
  email: { from: { name: string; email: string }; subject: string; body: string },
  language: 'tr' | 'en',
): Promise<PhishingAnalysis> {
  const raw = await callTool('analyze_phishing', {
    from: `${email.from.name} <${email.from.email}>`,
    subject: email.subject,
    body: email.body,
    language,
  });

  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return parsed as PhishingAnalysis;
}

export async function isAvailable(): Promise<boolean> {
  try {
    const res = await fetch(MCP_URL, { method: 'GET', signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface McpDiagnosis {
  ok: boolean;
  detail: string;
}

/**
 * End-to-end probe used by the settings UI. Unlike isAvailable() this sends an
 * authenticated POST, so a wrong/missing bearer token surfaces as 401 instead
 * of silently reporting a healthy connection.
 */
export async function diagnose(): Promise<McpDiagnosis> {
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401) {
      return {
        ok: false,
        detail: HOME_AI_TOKEN
          ? 'Köprü token’ı reddetti (401). Uygulamadaki token sunucudakiyle eşleşmiyor.'
          : 'Bu yapıya token gömülmemiş (401). Derleme sırasında VITE_HOME_AI_TOKEN verilmemiş.',
      };
    }
    if (!res.ok) {
      return { ok: false, detail: `Köprü ${res.status} döndü.` };
    }

    const data = await res.json();
    const count = data?.result?.tools?.length ?? 0;
    return count > 0
      ? { ok: true, detail: `Bağlandı — Claude Code köprüsü, ${count} araç hazır.` }
      : { ok: false, detail: 'Köprü yanıt verdi ama araç listesi boş.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: `Köprüye ulaşılamadı: ${msg}` };
  }
}
