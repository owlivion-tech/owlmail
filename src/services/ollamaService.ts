// ============================================================================
// OwlMail Pro - Home AI Bridge Service
// ============================================================================
// Calls the self-hosted Claude Code bridge at HOME_AI_URL.
// Uses /v1/chat/completions (OpenAI-compatible) — no Rust invoke needed.

import type { CategorizationResult, PhishingAnalysis } from './geminiService';
import { HOME_AI_URL, HOME_AI_DEFAULT_MODEL, HOME_AI_TOKEN } from '../config/homeServer';

const DEFAULT_OLLAMA_URL = HOME_AI_URL;
const DEFAULT_MODEL = HOME_AI_DEFAULT_MODEL;

// ============================================================================
// Core API
// ============================================================================

async function chatComplete(
  userMessage: string,
  systemMessage: string | undefined,
  model: string,
  baseUrl: string,
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemMessage) messages.push({ role: 'system', content: systemMessage });
  messages.push({ role: 'user', content: userMessage });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (HOME_AI_TOKEN) headers['Authorization'] = `Bearer ${HOME_AI_TOKEN}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) throw new Error(`AI bridge error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ============================================================================
// Model Management
// ============================================================================

export async function listModels(baseUrl: string = DEFAULT_OLLAMA_URL) {
  try {
    const res = await fetch(`${baseUrl}/v1/models`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((m: { id: string }) => ({ name: m.id, size: 0, modified_at: '' }));
  } catch {
    return [];
  }
}

export async function testConnection(baseUrl: string = DEFAULT_OLLAMA_URL): Promise<boolean> {
  try {
    const models = await listModels(baseUrl);
    return models.length > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Email Categorization
// ============================================================================

export async function categorizeEmail(
  email: { from: { name: string; email: string }; subject: string; body: string },
  availableLabels: string[],
  language: 'tr' | 'en' = 'tr',
  model: string = DEFAULT_MODEL,
  baseUrl: string = DEFAULT_OLLAMA_URL,
): Promise<CategorizationResult> {
  const labelList = availableLabels.length > 0
    ? availableLabels.join(', ')
    : 'Work, Personal, Finance, Newsletter, Social, Updates, Promotions';

  const truncatedBody = (email.body || '').slice(0, 3000);

  const prompt = language === 'tr'
    ? `Asagidaki e-postayi analiz et ve kategorize et.\n\nGonderen: ${email.from.name} <${email.from.email}>\nKonu: ${email.subject}\nIcerik: ${truncatedBody}\n\nMevcut etiketler: ${labelList}\n\nJSON formatinda yanit ver (baska bir sey yazma):\n{"suggestedLabels": ["etiket1"], "newLabelSuggestions": [], "confidence": 0.8, "reasoning": "kisa aciklama"}`
    : `Analyze and categorize this email.\n\nFrom: ${email.from.name} <${email.from.email}>\nSubject: ${email.subject}\nContent: ${truncatedBody}\n\nAvailable labels: ${labelList}\n\nRespond in JSON only (nothing else):\n{"suggestedLabels": ["label1"], "newLabelSuggestions": [], "confidence": 0.8, "reasoning": "brief explanation"}`;

  try {
    const response = await chatComplete(
      prompt,
      'You are an email categorization assistant. Always respond with valid JSON only.',
      model,
      baseUrl,
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        category: parsed.category || 'uncategorized',
        suggestedLabels: (parsed.suggestedLabels || []).slice(0, 3),
        newLabelSuggestions: (parsed.newLabelSuggestions || []).slice(0, 2),
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || '',
      };
    }
  } catch (err) {
    console.error('Home AI categorization failed:', err);
  }

  return { category: 'uncategorized', suggestedLabels: [], newLabelSuggestions: [], confidence: 0, reasoning: '' };
}

// ============================================================================
// Email Summarization
// ============================================================================

export async function summarizeEmail(
  emailContent: string,
  language: 'tr' | 'en' = 'tr',
  model: string = DEFAULT_MODEL,
  baseUrl: string = DEFAULT_OLLAMA_URL,
): Promise<string> {
  const truncated = emailContent.slice(0, 5000);

  const prompt = language === 'tr'
    ? `Bu e-postayi 2-3 cumle ile ozetle:\n\n${truncated}`
    : `Summarize this email in 2-3 sentences:\n\n${truncated}`;

  try {
    return await chatComplete(
      prompt,
      language === 'tr'
        ? 'Sen bir e-posta ozetleme asistanisin. Kisa ve net ozetler yaz.'
        : 'You are an email summarization assistant. Write brief, clear summaries.',
      model,
      baseUrl,
    );
  } catch (err) {
    console.error('Home AI summarization failed:', err);
    return '';
  }
}

// ============================================================================
// AI Reply Generation
// ============================================================================

export async function generateReply(
  emailContent: string,
  tone: 'professional' | 'friendly' | 'formal' | 'casual',
  senderName: string,
  language: 'tr' | 'en' = 'tr',
  model: string = DEFAULT_MODEL,
  baseUrl: string = DEFAULT_OLLAMA_URL,
): Promise<string> {
  const truncated = emailContent.slice(0, 4000);
  const toneMap = {
    professional: language === 'tr' ? 'profesyonel' : 'professional',
    friendly: language === 'tr' ? 'samimi' : 'friendly',
    formal: language === 'tr' ? 'resmi' : 'formal',
    casual: language === 'tr' ? 'gunluk' : 'casual',
  };

  const prompt = language === 'tr'
    ? `Bu e-postaya ${toneMap[tone]} tonda bir yanit yaz. Imza olarak "${senderName}" kullan.\n\nE-posta:\n${truncated}`
    : `Write a ${toneMap[tone]} reply to this email. Sign as "${senderName}".\n\nEmail:\n${truncated}`;

  try {
    return await chatComplete(
      prompt,
      language === 'tr'
        ? 'Sen bir e-posta yazma asistanisin. Sadece e-posta yanitini yaz.'
        : 'You are an email writing assistant. Write only the email reply.',
      model,
      baseUrl,
    );
  } catch (err) {
    console.error('Home AI reply generation failed:', err);
    return '';
  }
}

// ============================================================================
// Phishing Analysis
// ============================================================================

export async function analyzePhishing(
  email: { from: { name: string; email: string }; subject: string; body: string },
  language: 'tr' | 'en' = 'tr',
  model: string = DEFAULT_MODEL,
  baseUrl: string = DEFAULT_OLLAMA_URL,
): Promise<PhishingAnalysis> {
  const truncated = (email.body || '').slice(0, 3000);

  const prompt = language === 'tr'
    ? `Bu e-postayi phishing/dolandiricilik acisindan analiz et.\n\nGonderen: ${email.from.name} <${email.from.email}>\nKonu: ${email.subject}\nIcerik: ${truncated}\n\nJSON formatinda yanit ver:\n{"score": 0-100, "riskLevel": "low|medium|high|critical", "indicators": ["gosterge1"], "recommendation": "tavsiye"}`
    : `Analyze this email for phishing/fraud.\n\nFrom: ${email.from.name} <${email.from.email}>\nSubject: ${email.subject}\nContent: ${truncated}\n\nRespond in JSON only:\n{"score": 0-100, "riskLevel": "low|medium|high|critical", "indicators": ["indicator1"], "recommendation": "advice"}`;

  try {
    const response = await chatComplete(
      prompt,
      'You are a cybersecurity expert analyzing emails for phishing. Respond with JSON only.',
      model,
      baseUrl,
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.min(100, Math.max(0, parsed.score || 0));
      const riskLevel = ['low', 'medium', 'high', 'critical'].includes(parsed.riskLevel)
        ? parsed.riskLevel : 'low';
      const reasons = Array.isArray(parsed.indicators) ? parsed.indicators : [];
      const recommendation = parsed.recommendation || '';
      return {
        isPhishing: score >= 50,
        riskLevel,
        score,
        reasons,
        recommendations: recommendation ? [recommendation] : [],
      };
    }
  } catch (err) {
    console.error('Home AI phishing analysis failed:', err);
  }

  return { isPhishing: false, riskLevel: 'low', score: 0, reasons: [], recommendations: [] };
}
